import 'server-only';

import type { PaymentStatus, Prisma } from '@prisma/client';

import {
  createMercadoPagoPixOrder,
  getMercadoPagoOrder,
  MercadoPagoApiError,
} from '@/lib/mercado-pago/client';
import { getMercadoPagoConfig, MERCADO_PAGO_PIX_EXPIRATION } from '@/lib/mercado-pago/config';
import { credentialAad, decryptCredential } from '@/lib/mercado-pago/crypto';
import type { MercadoPagoOrder } from '@/lib/mercado-pago/schemas';
import { mapMercadoPagoOrderStatus } from '@/lib/mercado-pago/status-mapper';
import { getDb } from '@/server/database/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/server/errors';
import { appendOrderOutboxEvent } from './order-outbox.service';
import { appendPaymentStatusHistory } from './order-payment-history.service';
import {
  getMercadoPagoAccessToken,
  markMercadoPagoReauthRequired,
} from './mercado-pago-connection.service';

export interface MercadoPagoSyncResult {
  orderId: string;
  storeId: string;
  orderNumber: number;
  paymentStatus: PaymentStatus;
  eventIds: string[];
  becameActionable: boolean;
}

function centsToAmount(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function amountToCents(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

function firstPayment(order: MercadoPagoOrder) {
  return order.transactions.payments[0] ?? null;
}

function safeProviderErrorCode(error: unknown): string {
  if (error instanceof MercadoPagoApiError) return error.code.slice(0, 64);
  if (error instanceof DOMException && error.name === 'AbortError') return 'TIMEOUT';
  return 'PROVIDER_UNAVAILABLE';
}

function isRetryableProviderError(error: unknown): boolean {
  return (
    (error instanceof MercadoPagoApiError && (error.status === 429 || error.status >= 500)) ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

async function writeProviderAudit(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    storeId: string;
    entityId: string;
    orderId: string;
    previousStatus: string;
    nextStatus: string;
  },
) {
  return tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      userId: null,
      action: 'PAYMENT_PROVIDER_STATUS_UPDATED',
      entity: 'MercadoPagoPayment',
      entityId: input.entityId,
      metadata: {
        orderId: input.orderId,
        source: 'WEBHOOK',
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
      },
    },
    select: { id: true },
  });
}

export async function reconcileMercadoPagoOrder(
  providerOrder: MercadoPagoOrder,
): Promise<MercadoPagoSyncResult | null> {
  const local = await getDb().mercadoPagoPayment.findUnique({
    where: { externalReference: providerOrder.external_reference },
    include: {
      connection: { select: { providerUserId: true } },
      order: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderNumber: true,
          total: true,
          status: true,
          paymentStatus: true,
          version: true,
        },
      },
      payment: { select: { id: true, status: true, amount: true, provider: true } },
    },
  });
  if (!local) return null;
  if (
    local.connection.providerUserId !== providerOrder.user_id ||
    local.payment.provider !== 'MERCADO_PAGO'
  ) {
    console.error('[MP_PROVIDER_SCOPE_MISMATCH]', { mercadoPagoPaymentId: local.id });
    return null;
  }
  const providerPayment = firstPayment(providerOrder);
  const providerPaymentAmount = amountToCents(providerPayment?.amount);
  if (
    providerOrder.currency !== 'BRL' ||
    amountToCents(providerOrder.total_amount) !== local.order.total ||
    (providerPaymentAmount !== null && providerPaymentAmount !== local.order.total)
  ) {
    console.error('[MP_AMOUNT_MISMATCH]', {
      orderId: local.orderId,
      mercadoPagoPaymentId: local.id,
    });
    await getDb().mercadoPagoPayment.update({
      where: { id: local.id },
      data: {
        providerOrderId: providerOrder.id,
        providerStatus: providerOrder.status,
        providerStatusDetail: providerOrder.status_detail,
        lastErrorCode: 'AMOUNT_MISMATCH',
        lastSyncedAt: new Date(),
      },
    });
    return null;
  }

  const mapped = mapMercadoPagoOrderStatus(providerOrder.status, providerOrder.status_detail);
  if (mapped === 'PAID') {
    const paid = amountToCents(
      providerOrder.total_paid_amount ?? firstPayment(providerOrder)?.paid_amount,
    );
    if (paid !== local.order.total) {
      console.error('[MP_AMOUNT_MISMATCH]', {
        orderId: local.orderId,
        mercadoPagoPaymentId: local.id,
      });
      return null;
    }
  }
  if (
    mapped === 'REFUNDED' &&
    amountToCents(providerOrder.total_refunded_amount) !== local.order.total
  ) {
    console.error('[MP_AMOUNT_MISMATCH]', {
      orderId: local.orderId,
      mercadoPagoPaymentId: local.id,
      kind: 'refund',
    });
    return null;
  }
  const now = new Date();

  return getDb().$transaction(async (tx) => {
    const current = await tx.order.findFirst({
      where: { id: local.orderId, tenantId: local.tenantId, storeId: local.storeId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        orderNumber: true,
        total: true,
        status: true,
        paymentStatus: true,
        version: true,
        payment: { select: { id: true, status: true, amount: true, provider: true } },
      },
    });
    if (!current?.payment || current.payment.provider !== 'MERCADO_PAGO') return null;

    await tx.mercadoPagoPayment.update({
      where: { id: local.id },
      data: {
        creationStatus: 'CREATED',
        providerOrderId: providerOrder.id,
        providerPaymentId: providerPayment?.id ?? null,
        providerStatus: providerOrder.status,
        providerStatusDetail: providerOrder.status_detail,
        qrCode: providerPayment?.payment_method.qr_code ?? local.qrCode,
        ticketUrl: providerPayment?.payment_method.ticket_url ?? local.ticketUrl,
        expiresAt: providerPayment?.date_of_expiration
          ? new Date(providerPayment.date_of_expiration)
          : local.expiresAt,
        payerEmailCiphertext: null,
        payerEmailIv: null,
        lastErrorCode: mapped === 'REVIEW' ? 'UNMAPPED_STATUS' : null,
        lastSyncedAt: now,
      },
    });

    if (mapped === 'PENDING' || mapped === 'REVIEW') {
      if (mapped === 'REVIEW') {
        console.warn('[MP_STATUS_UNMAPPED]', {
          mercadoPagoPaymentId: local.id,
          status: providerOrder.status,
          statusDetail: providerOrder.status_detail,
        });
      }
      return {
        orderId: current.id,
        storeId: current.storeId,
        orderNumber: current.orderNumber,
        paymentStatus: current.paymentStatus,
        eventIds: [],
        becameActionable: false,
      };
    }

    let nextPaymentStatus: PaymentStatus;
    let nextOrderStatus = current.status;
    let reasonCode: string | undefined;
    if (mapped === 'PAID') {
      nextPaymentStatus = 'PAID';
      if (current.status === 'AWAITING_PAYMENT') nextOrderStatus = 'PENDING';
    } else if (mapped === 'REFUNDED') {
      if (current.paymentStatus !== 'PAID') {
        return {
          orderId: current.id,
          storeId: current.storeId,
          orderNumber: current.orderNumber,
          paymentStatus: current.paymentStatus,
          eventIds: [],
          becameActionable: false,
        };
      }
      nextPaymentStatus = 'REFUNDED';
    } else if (mapped === 'CANCELLED') {
      nextPaymentStatus = 'CANCELLED';
      nextOrderStatus = 'CANCELLED';
      reasonCode = 'PROVIDER_CANCELLED';
    } else {
      nextPaymentStatus = 'FAILED';
      nextOrderStatus = 'CANCELLED';
      reasonCode = mapped === 'EXPIRED' ? 'PROVIDER_EXPIRED' : 'PROVIDER_FAILED';
    }

    if (current.paymentStatus === nextPaymentStatus && current.status === nextOrderStatus) {
      return {
        orderId: current.id,
        storeId: current.storeId,
        orderNumber: current.orderNumber,
        paymentStatus: current.paymentStatus,
        eventIds: [],
        becameActionable: false,
      };
    }
    const nextVersion = current.version + 1;
    const orderUpdated = await tx.order.updateMany({
      where: {
        id: current.id,
        tenantId: current.tenantId,
        storeId: current.storeId,
        version: current.version,
        status: current.status,
        paymentStatus: current.paymentStatus,
      },
      data: {
        status: nextOrderStatus,
        paymentStatus: nextPaymentStatus,
        version: { increment: 1 },
        statusChangedAt: nextOrderStatus !== current.status ? now : undefined,
        cancelledAt: nextOrderStatus === 'CANCELLED' ? now : undefined,
        cancellationReasonCode:
          nextOrderStatus === 'CANCELLED' ? 'PAYMENT_NOT_IDENTIFIED' : undefined,
        cancellationSource: nextOrderStatus === 'CANCELLED' ? 'WEBHOOK' : undefined,
      },
    });
    if (orderUpdated.count !== 1)
      throw new ConflictError('O pedido foi atualizado durante a conciliação.');

    await appendPaymentStatusHistory(tx, {
      tenantId: current.tenantId,
      storeId: current.storeId,
      orderId: current.id,
      paymentId: current.payment.id,
      fromStatus: current.paymentStatus,
      toStatus: nextPaymentStatus,
      changedById: null,
      actorNameSnapshot: 'Mercado Pago',
      source: 'WEBHOOK',
      reasonCode,
      note: 'Estado confirmado por consulta autenticada ao provedor.',
      orderVersionFrom: current.version,
      orderVersionTo: nextVersion,
      createdAt: now,
    });
    if (nextOrderStatus !== current.status) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: current.id,
          fromStatus: current.status,
          toStatus: nextOrderStatus,
          note: 'Estado atualizado após confirmação do pagamento online.',
          changedBy: 'system',
          actorNameSnapshot: 'Mercado Pago',
          source: 'WEBHOOK',
          versionFrom: current.version,
          versionTo: nextVersion,
        },
      });
    }
    await tx.payment.update({
      where: { id: current.payment.id },
      data: {
        status: nextPaymentStatus,
        paidAt: nextPaymentStatus === 'PAID' ? now : undefined,
        failedAt: nextPaymentStatus === 'FAILED' ? now : undefined,
        failureReasonCode: nextPaymentStatus === 'FAILED' ? reasonCode : undefined,
        cancelledAt: nextPaymentStatus === 'CANCELLED' ? now : undefined,
        refundedAt: nextPaymentStatus === 'REFUNDED' ? now : undefined,
        refundReasonCode: nextPaymentStatus === 'REFUNDED' ? 'PROVIDER_REFUND' : undefined,
        refundAmount: nextPaymentStatus === 'REFUNDED' ? current.payment.amount : undefined,
      },
    });
    const providerAudit = await writeProviderAudit(tx, {
      tenantId: current.tenantId,
      storeId: current.storeId,
      entityId: local.id,
      orderId: current.id,
      previousStatus: current.paymentStatus,
      nextStatus: nextPaymentStatus,
    });
    const eventIds: string[] = [];
    const paymentEvent = await appendOrderOutboxEvent(tx, {
      tenantId: current.tenantId,
      storeId: current.storeId,
      orderId: current.id,
      auditLogId: providerAudit.id,
      eventType: 'PAYMENT_UPDATED',
      orderNumber: current.orderNumber,
      status: nextOrderStatus,
      paymentStatus: nextPaymentStatus,
      aggregateVersion: nextVersion,
      occurredAt: now,
    });
    eventIds.push(paymentEvent.id);
    const becameActionable = current.status === 'AWAITING_PAYMENT' && nextOrderStatus === 'PENDING';
    if (becameActionable) {
      const orderAudit = await tx.auditLog.create({
        data: {
          tenantId: current.tenantId,
          storeId: current.storeId,
          userId: null,
          action: 'ORDER_CREATED',
          entity: 'Order',
          entityId: current.id,
          metadata: { source: 'WEBHOOK', previousStatus: current.status, nextStatus: 'PENDING' },
        },
        select: { id: true },
      });
      const orderEvent = await appendOrderOutboxEvent(tx, {
        tenantId: current.tenantId,
        storeId: current.storeId,
        orderId: current.id,
        auditLogId: orderAudit.id,
        eventType: 'ORDER_CREATED',
        orderNumber: current.orderNumber,
        status: 'PENDING',
        paymentStatus: nextPaymentStatus,
        aggregateVersion: nextVersion,
        occurredAt: now,
      });
      eventIds.push(orderEvent.id);
    }
    return {
      orderId: current.id,
      storeId: current.storeId,
      orderNumber: current.orderNumber,
      paymentStatus: nextPaymentStatus,
      eventIds,
      becameActionable,
    };
  });
}

async function failCreation(
  mercadoPagoPaymentId: string,
  errorCode: string,
  retryable: boolean,
): Promise<MercadoPagoSyncResult | null> {
  if (retryable) {
    await getDb().mercadoPagoPayment.updateMany({
      where: {
        id: mercadoPagoPaymentId,
        creationStatus: { in: ['PENDING', 'RETRYABLE_ERROR'] },
      },
      data: { creationStatus: 'RETRYABLE_ERROR', lastErrorCode: errorCode },
    });
    return null;
  }

  return getDb().$transaction(async (tx) => {
    const local = await tx.mercadoPagoPayment.findUnique({
      where: { id: mercadoPagoPaymentId },
      include: {
        order: {
          select: {
            id: true,
            tenantId: true,
            storeId: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            version: true,
          },
        },
        payment: { select: { id: true, status: true } },
      },
    });
    if (!local) return null;
    await tx.mercadoPagoPayment.update({
      where: { id: local.id },
      data: {
        creationStatus: 'FAILED',
        lastErrorCode: errorCode,
        payerEmailCiphertext: null,
        payerEmailIv: null,
      },
    });
    if (
      local.order.status !== 'AWAITING_PAYMENT' ||
      local.order.paymentStatus !== 'PENDING' ||
      local.payment.status !== 'PENDING'
    ) {
      return null;
    }

    const now = new Date();
    const nextVersion = local.order.version + 1;
    const updated = await tx.order.updateMany({
      where: {
        id: local.order.id,
        tenantId: local.order.tenantId,
        storeId: local.order.storeId,
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        version: local.order.version,
      },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'FAILED',
        version: { increment: 1 },
        statusChangedAt: now,
        cancelledAt: now,
        cancellationReasonCode: 'PAYMENT_NOT_IDENTIFIED',
        cancellationSource: 'SYSTEM',
      },
    });
    if (updated.count !== 1) return null;
    await appendPaymentStatusHistory(tx, {
      tenantId: local.order.tenantId,
      storeId: local.order.storeId,
      orderId: local.order.id,
      paymentId: local.payment.id,
      fromStatus: 'PENDING',
      toStatus: 'FAILED',
      changedById: null,
      actorNameSnapshot: 'Mercado Pago',
      source: 'SYSTEM',
      reasonCode: 'PROVIDER_CREATE_FAILED',
      note: 'O provedor recusou definitivamente a criação do Pix.',
      orderVersionFrom: local.order.version,
      orderVersionTo: nextVersion,
      createdAt: now,
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: local.order.id,
        fromStatus: 'AWAITING_PAYMENT',
        toStatus: 'CANCELLED',
        note: 'A criação do Pix falhou definitivamente.',
        changedBy: 'system',
        actorNameSnapshot: 'Mercado Pago',
        source: 'SYSTEM',
        versionFrom: local.order.version,
        versionTo: nextVersion,
      },
    });
    await tx.payment.update({
      where: { id: local.payment.id },
      data: {
        status: 'FAILED',
        failedAt: now,
        failureReasonCode: 'PROVIDER_CREATE_FAILED',
      },
    });
    const audit = await writeProviderAudit(tx, {
      tenantId: local.order.tenantId,
      storeId: local.order.storeId,
      entityId: local.id,
      orderId: local.order.id,
      previousStatus: 'PENDING',
      nextStatus: 'FAILED',
    });
    const event = await appendOrderOutboxEvent(tx, {
      tenantId: local.order.tenantId,
      storeId: local.order.storeId,
      orderId: local.order.id,
      auditLogId: audit.id,
      eventType: 'PAYMENT_UPDATED',
      orderNumber: local.order.orderNumber,
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      aggregateVersion: nextVersion,
      occurredAt: now,
    });
    return {
      orderId: local.order.id,
      storeId: local.order.storeId,
      orderNumber: local.order.orderNumber,
      paymentStatus: 'FAILED',
      eventIds: [event.id],
      becameActionable: false,
    };
  });
}

export async function ensureMercadoPagoPixCreated(
  mercadoPagoPaymentId: string,
): Promise<MercadoPagoSyncResult | null> {
  const local = await getDb().mercadoPagoPayment.findUnique({
    where: { id: mercadoPagoPaymentId },
    include: { order: { select: { total: true } } },
  });
  if (!local) throw new NotFoundError('Pagamento Mercado Pago');
  if (local.providerOrderId) {
    let accessToken = await getMercadoPagoAccessToken(local.connectionId, {
      allowReconciliation: true,
    });
    try {
      const providerOrder = await getMercadoPagoOrder({
        accessToken,
        orderId: local.providerOrderId,
      });
      return reconcileMercadoPagoOrder(providerOrder);
    } catch (error) {
      if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
      accessToken = await getMercadoPagoAccessToken(local.connectionId, {
        allowReconciliation: true,
        forceRefresh: true,
      });
      const providerOrder = await getMercadoPagoOrder({
        accessToken,
        orderId: local.providerOrderId,
      });
      return reconcileMercadoPagoOrder(providerOrder);
    }
  }
  if (!local.payerEmailCiphertext || !local.payerEmailIv) {
    throw new BusinessRuleError(
      'Não foi possível recuperar os dados necessários para gerar o Pix.',
    );
  }
  const config = getMercadoPagoConfig();
  const payerEmail = await decryptCredential(
    { ciphertext: local.payerEmailCiphertext, iv: local.payerEmailIv },
    config.encryptionKey,
    credentialAad({
      tenantId: local.tenantId,
      storeId: local.storeId,
      provider: 'MERCADO_PAGO',
      kind: 'payer_email',
      version: local.credentialVersion,
    }),
  );

  let accessToken = await getMercadoPagoAccessToken(local.connectionId);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const providerOrder = await createMercadoPagoPixOrder({
        accessToken,
        idempotencyKey: local.idempotencyKey,
        totalAmount: centsToAmount(local.order.total),
        externalReference: local.externalReference,
        payerEmail,
        expiration: MERCADO_PAGO_PIX_EXPIRATION,
      });
      console.info('[MP_ORDER_CREATED]', {
        mercadoPagoPaymentId: local.id,
        orderId: local.orderId,
      });
      return reconcileMercadoPagoOrder(providerOrder);
    } catch (error) {
      lastError = error;
      if (attempt === 0 && error instanceof MercadoPagoApiError && error.status === 401) {
        accessToken = await getMercadoPagoAccessToken(local.connectionId, { forceRefresh: true });
        continue;
      }
      if (attempt === 1 && error instanceof MercadoPagoApiError && error.status === 401) {
        await markMercadoPagoReauthRequired(local.connectionId, 'SECOND_401');
      }
      if (attempt === 0 && isRetryableProviderError(error)) continue;
      break;
    }
  }
  const retryable = isRetryableProviderError(lastError);
  const code = safeProviderErrorCode(lastError);
  const failureResult = await failCreation(local.id, code, retryable);
  console.warn('[MP_ORDER_CREATE_FAILED]', { mercadoPagoPaymentId: local.id, code, retryable });
  return failureResult;
}

export async function getMercadoPagoPaymentPresentation(orderId: string) {
  return getDb().mercadoPagoPayment.findUnique({
    where: { orderId },
    select: {
      creationStatus: true,
      qrCode: true,
      ticketUrl: true,
      expiresAt: true,
      providerStatus: true,
      providerStatusDetail: true,
    },
  });
}
