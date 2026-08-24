import 'server-only';

import { getMercadoPagoOrder, MercadoPagoApiError } from '@/lib/mercado-pago/client';
import { getMercadoPagoOAuthEnvironment } from '@/lib/mercado-pago/config';
import type { mercadoPagoWebhookSchema } from '@/lib/mercado-pago/schemas';
import { getDb } from '@/server/database/client';
import { getMercadoPagoAccessToken } from './mercado-pago-connection.service';
import { getMercadoPagoOrdersCredential } from './mercado-pago-orders-credential.service';
import { reconcileMercadoPagoOrder } from './mercado-pago-payment.service';
import { recordPaymentProviderAlert } from './payment-provider-alert.service';

type MercadoPagoWebhook = ReturnType<typeof mercadoPagoWebhookSchema.parse>;
const WEBHOOK_LEASE_MS = 2 * 60_000;
const MAX_WEBHOOK_ATTEMPTS = 8;

export async function enqueueMercadoPagoWebhook(event: MercadoPagoWebhook) {
  return getDb().paymentProviderWebhookEvent.upsert({
    where: {
      provider_providerEventId: { provider: 'MERCADO_PAGO', providerEventId: event.id },
    },
    create: {
      provider: 'MERCADO_PAGO',
      providerEventId: event.id,
      topic: event.type,
      action: event.action,
      providerUserId: event.user_id,
      providerObjectId: event.data.id,
    },
    update: {},
    select: { id: true, processedAt: true },
  });
}

async function processDeauthorization(eventId: string, providerUserId: string) {
  await getDb().$transaction(async (tx) => {
    await tx.storePaymentProviderConnection.updateMany({
      where: { provider: 'MERCADO_PAGO', providerUserId },
      data: {
        status: 'REVOKED',
        accessTokenCiphertext: null,
        accessTokenIv: null,
        refreshTokenCiphertext: null,
        refreshTokenIv: null,
        tokenExpiresAt: null,
        reauthRequiredAt: new Date(),
        lastErrorCode: 'APPLICATION_DEAUTHORIZED',
      },
    });
    await tx.paymentProviderWebhookEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), processingStartedAt: null, lastErrorCode: null },
    });
  });
}

async function synchronizeOrder(providerUserId: string, providerOrderId: string) {
  if (getMercadoPagoOAuthEnvironment() === 'sandbox') {
    const localPayment = await getDb().mercadoPagoPayment.findFirst({
      where: { providerOrderId },
      select: { connectionId: true },
    });
    if (!localPayment) throw new Error('SANDBOX_ORDER_NOT_LINKED');
    let credential = await getMercadoPagoOrdersCredential(localPayment.connectionId, {
      allowReconciliation: true,
    });
    if (credential.expectedProviderUserId !== providerUserId) {
      throw new Error('INVALID_SANDBOX_PROVIDER_USER');
    }
    let providerOrder;
    try {
      providerOrder = await getMercadoPagoOrder({
        accessToken: credential.accessToken,
        orderId: providerOrderId,
      });
    } catch (error) {
      if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
      credential = await getMercadoPagoOrdersCredential(localPayment.connectionId, {
        allowReconciliation: true,
        forceRefresh: true,
      });
      providerOrder = await getMercadoPagoOrder({
        accessToken: credential.accessToken,
        orderId: providerOrderId,
      });
    }
    if (providerOrder.user_id !== credential.expectedProviderUserId) {
      throw new Error('INVALID_SANDBOX_ORDER_SCOPE');
    }
    const result = await reconcileMercadoPagoOrder(
      providerOrder,
      credential.expectedProviderUserId,
      'WEBHOOK',
    );
    if (result) {
      console.info('[MP_WEBHOOK_SYNCED]', {
        orderId: result.orderId,
        paymentStatus: result.paymentStatus,
      });
    }
    return;
  }

  const connections = await getDb().storePaymentProviderConnection.findMany({
    where: {
      provider: 'MERCADO_PAGO',
      providerUserId,
      accessTokenCiphertext: { not: null },
      accessTokenIv: { not: null },
    },
    select: { id: true },
  });

  let fetchedProviderOrder = false;
  for (const connection of connections) {
    try {
      let accessToken = await getMercadoPagoAccessToken(connection.id, {
        allowReconciliation: true,
      });
      let providerOrder;
      try {
        providerOrder = await getMercadoPagoOrder({ accessToken, orderId: providerOrderId });
      } catch (error) {
        if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
        accessToken = await getMercadoPagoAccessToken(connection.id, {
          allowReconciliation: true,
          forceRefresh: true,
        });
        providerOrder = await getMercadoPagoOrder({ accessToken, orderId: providerOrderId });
      }
      fetchedProviderOrder = true;
      if (providerOrder.user_id !== providerUserId) continue;
      const result = await reconcileMercadoPagoOrder(providerOrder, undefined, 'WEBHOOK');
      if (!result) continue;
      console.info('[MP_WEBHOOK_SYNCED]', {
        orderId: result.orderId,
        paymentStatus: result.paymentStatus,
      });
      return;
    } catch (error) {
      console.warn('[MP_WEBHOOK_CANDIDATE_FAILED]', {
        connectionId: connection.id,
        code: error instanceof MercadoPagoApiError ? error.code : 'SYNC_FAILED',
      });
    }
  }
  if (connections.length > 0 && !fetchedProviderOrder) {
    throw new Error('Nenhuma credencial candidata conseguiu consultar a ordem.');
  }
}

async function processClaimedWebhook(event: {
  id: string;
  topic: string;
  action: string;
  providerUserId: string | null;
  providerObjectId: string | null;
}) {
  if (!event.providerUserId || !event.providerObjectId) throw new Error('INVALID_EVENT_SCOPE');
  if (event.topic === 'mp-connect') {
    if (event.action === 'application.deauthorized') {
      await processDeauthorization(event.id, event.providerUserId);
      return;
    }
  } else {
    await synchronizeOrder(event.providerUserId, event.providerObjectId);
  }
  await getDb().paymentProviderWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), processingStartedAt: null, lastErrorCode: null },
  });
}

export async function processPendingMercadoPagoWebhooks(limit = 20, eventId?: string) {
  const db = getDb();
  const now = new Date();
  const staleLease = new Date(now.getTime() - WEBHOOK_LEASE_MS);
  const candidates = await db.paymentProviderWebhookEvent.findMany({
    where: {
      id: eventId,
      provider: 'MERCADO_PAGO',
      processedAt: null,
      availableAt: { lte: now },
      attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleLease } }],
    },
    orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      topic: true,
      action: true,
      providerUserId: true,
      providerObjectId: true,
      attempts: true,
    },
  });
  let processed = 0;
  let failed = 0;
  for (const event of candidates) {
    const claimed = await db.paymentProviderWebhookEvent.updateMany({
      where: {
        id: event.id,
        processedAt: null,
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleLease } }],
      },
      data: { processingStartedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    try {
      await processClaimedWebhook(event);
      processed += 1;
    } catch (error) {
      failed += 1;
      const attempts = event.attempts + 1;
      const code =
        error instanceof MercadoPagoApiError ? error.code.slice(0, 64) : 'PROCESSING_FAILED';
      await db.paymentProviderWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingStartedAt: null,
          lastErrorCode: code,
          availableAt: new Date(Date.now() + Math.min(15 * 60_000, 15_000 * 2 ** attempts)),
        },
      });
      if (attempts >= MAX_WEBHOOK_ATTEMPTS) {
        await recordPaymentProviderAlert({
          code: 'WEBHOOK_RETRIES_EXHAUSTED',
          priority: 'CRITICAL',
        });
      }
    }
  }
  return { selected: candidates.length, processed, failed };
}

export function processMercadoPagoWebhookById(eventId: string) {
  return processPendingMercadoPagoWebhooks(1, eventId);
}
