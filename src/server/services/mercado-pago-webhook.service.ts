import 'server-only';

import { Prisma } from '@prisma/client';

import { getMercadoPagoOrder, MercadoPagoApiError } from '@/lib/mercado-pago/client';
import type { mercadoPagoWebhookSchema } from '@/lib/mercado-pago/schemas';
import { triggerNewOrder, triggerPaymentUpdated } from '@/lib/pusher/server';
import { getDb } from '@/server/database/client';
import { dispatchCommittedOrderEvents } from './order-event-dispatch.service';
import { getMercadoPagoAccessToken } from './mercado-pago-connection.service';
import { reconcileMercadoPagoOrder } from './mercado-pago-payment.service';

type MercadoPagoWebhook = ReturnType<typeof mercadoPagoWebhookSchema.parse>;

async function processDeauthorization(
  event: MercadoPagoWebhook,
): Promise<'processed' | 'duplicate'> {
  const db = getDb();
  const existing = await db.paymentProviderWebhookEvent.findUnique({
    where: {
      provider_providerEventId: {
        provider: 'MERCADO_PAGO',
        providerEventId: event.id,
      },
    },
    select: { id: true, processedAt: true },
  });
  if (existing?.processedAt) return 'duplicate';

  let eventId = existing?.id;
  if (!eventId) {
    try {
      const created = await db.paymentProviderWebhookEvent.create({
        data: {
          provider: 'MERCADO_PAGO',
          providerEventId: event.id,
          topic: event.type,
          action: event.action,
          providerUserId: event.user_id,
        },
        select: { id: true },
      });
      eventId = created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'duplicate';
      }
      throw error;
    }
  }

  await db.$transaction(async (tx) => {
    await tx.storePaymentProviderConnection.updateMany({
      where: { provider: 'MERCADO_PAGO', providerUserId: event.user_id },
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
      data: { processedAt: new Date() },
    });
  });
  return 'processed';
}

async function synchronizeOrder(event: MercadoPagoWebhook) {
  const connections = await getDb().storePaymentProviderConnection.findMany({
    where: {
      provider: 'MERCADO_PAGO',
      providerUserId: event.user_id,
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
        providerOrder = await getMercadoPagoOrder({
          accessToken,
          orderId: event.data.id,
        });
      } catch (error) {
        if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
        accessToken = await getMercadoPagoAccessToken(connection.id, {
          allowReconciliation: true,
          forceRefresh: true,
        });
        providerOrder = await getMercadoPagoOrder({
          accessToken,
          orderId: event.data.id,
        });
      }
      fetchedProviderOrder = true;
      if (providerOrder.user_id !== event.user_id) continue;
      const result = await reconcileMercadoPagoOrder(providerOrder);
      if (!result) continue;
      if (result.eventIds.length) {
        await dispatchCommittedOrderEvents({
          eventIds: result.eventIds,
          publishDirect: async () => {
            await triggerPaymentUpdated(result.storeId, result.orderId, result.paymentStatus);
            if (result.becameActionable) {
              await triggerNewOrder(result.storeId, result.orderId, result.orderNumber);
            }
          },
        });
      }
      console.info('[MP_WEBHOOK_SYNCED]', {
        orderId: result.orderId,
        paymentStatus: result.paymentStatus,
      });
      return 'processed' as const;
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
  return 'ignored' as const;
}

export async function processMercadoPagoWebhook(event: MercadoPagoWebhook) {
  if (event.type === 'mp-connect') {
    if (event.action !== 'application.deauthorized') return 'ignored' as const;
    return processDeauthorization(event);
  }
  return synchronizeOrder(event);
}
