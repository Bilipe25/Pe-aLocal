import 'server-only';

import type { PaymentStatus, Prisma } from '@prisma/client';

import {
  createMercadoPagoPixOrder,
  getMercadoPagoOrder,
  MercadoPagoApiError,
  searchMercadoPagoOrders,
} from '@/lib/mercado-pago/client';
import { getMercadoPagoConfig, MERCADO_PAGO_PIX_EXPIRATION } from '@/lib/mercado-pago/config';
import { credentialAad, decryptCredential } from '@/lib/mercado-pago/crypto';
import type { MercadoPagoCreatedOrder, MercadoPagoOrder } from '@/lib/mercado-pago/schemas';
import { mapMercadoPagoOrderStatus } from '@/lib/mercado-pago/status-mapper';
import { decideMercadoPagoTransition } from '@/lib/mercado-pago/transition-matrix';
import { getDb } from '@/server/database/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/server/errors';
import { appendOrderOutboxEvent } from './order-outbox.service';
import { appendPaymentStatusHistory } from './order-payment-history.service';
import {
  recordPaymentProviderAlert,
  resolveRecoveredPaymentProviderCreationAlerts,
} from './payment-provider-alert.service';
import { markMercadoPagoReauthRequired } from './mercado-pago-connection.service';
import {
  getMercadoPagoOrdersCredential,
  type MercadoPagoOrdersCredential,
} from './mercado-pago-orders-credential.service';

export interface MercadoPagoSyncResult {
  orderId: string;
  storeId: string;
  orderNumber: number;
  paymentStatus: PaymentStatus;
  eventIds: string[];
  becameActionable: boolean;
  failureCode?: string;
}

export type MercadoPagoSyncSource = 'WEBHOOK' | 'RECONCILIATION';

function centsToAmount(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function amountToCents(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

function firstPayment(order: MercadoPagoOrder | MercadoPagoCreatedOrder) {
  return order.transactions.payments[0] ?? null;
}

class AmbiguousProviderOrderError extends Error {
  readonly code = 'AMBIGUOUS_EXTERNAL_REFERENCE';

  constructor() {
    super('Mais de uma order foi encontrada para a referência local.');
    this.name = 'AmbiguousProviderOrderError';
  }
}

function safeProviderErrorCode(error: unknown): string {
  if (error instanceof MercadoPagoApiError) return error.code.slice(0, 64);
  if (error instanceof AmbiguousProviderOrderError) return error.code;
  if (error instanceof DOMException && error.name === 'AbortError') return 'TIMEOUT';
  if (error instanceof TypeError) return 'NETWORK_ERROR';
  return 'PROVIDER_UNAVAILABLE';
}

export function isRetryableMercadoPagoCreationError(error: unknown): boolean {
  return (
    error instanceof AmbiguousProviderOrderError ||
    (error instanceof MercadoPagoApiError && error.code === 'idempotency_validation_failed') ||
    (error instanceof MercadoPagoApiError &&
      ([402, 409, 423, 429].includes(error.status) || error.status >= 500)) ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    error instanceof TypeError
  );
}

function canRepeatCreationImmediately(error: unknown): boolean {
  if (error instanceof MercadoPagoApiError) {
    if (error.status === 402 || error.status === 409) return false;
    if (![423, 429].includes(error.status) && error.status < 500) return false;
    return error.retryAfterSeconds === null || error.retryAfterSeconds <= 2;
  }
  return (
    (error instanceof DOMException && error.name === 'AbortError') || error instanceof TypeError
  );
}

async function waitBeforeCreationRetry(error: unknown) {
  const retryAfterMs =
    error instanceof MercadoPagoApiError && error.retryAfterSeconds !== null
      ? error.retryAfterSeconds * 1_000
      : 150;
  await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 2_000)));
}

function safeExpiration(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
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
    source?: MercadoPagoSyncSource;
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
        source: input.source ?? 'RECONCILIATION',
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
      },
    },
    select: { id: true },
  });
}

export async function reconcileMercadoPagoOrder(
  providerOrder: MercadoPagoOrder,
  expectedProviderUserId?: string,
  syncSource: MercadoPagoSyncSource = 'RECONCILIATION',
): Promise<MercadoPagoSyncResult | null> {
  const local = await getDb().mercadoPagoPayment.findUnique({
    where: { externalReference: providerOrder.external_reference },
    include: {
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
  const expectedUserId =
    expectedProviderUserId ??
    (
      await getMercadoPagoOrdersCredential(local.connectionId, {
        allowReconciliation: true,
      })
    ).expectedProviderUserId;
  if (expectedUserId !== providerOrder.user_id || local.payment.provider !== 'MERCADO_PAGO') {
    console.error('[MP_PROVIDER_SCOPE_MISMATCH]', { mercadoPagoPaymentId: local.id });
    await recordPaymentProviderAlert({
      code: 'PROVIDER_SCOPE_MISMATCH',
      priority: 'CRITICAL',
      tenantId: local.tenantId,
      storeId: local.storeId,
      orderId: local.orderId,
      paymentId: local.paymentId,
      mercadoPagoPaymentId: local.id,
    });
    return null;
  }
  const providerPayment = firstPayment(providerOrder);
  const providerPaymentAmount = amountToCents(providerPayment?.amount);
  if (
    (providerOrder.currency !== undefined && providerOrder.currency !== 'BRL') ||
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
    await recordPaymentProviderAlert({
      code: 'AMOUNT_MISMATCH',
      priority: 'CRITICAL',
      tenantId: local.tenantId,
      storeId: local.storeId,
      orderId: local.orderId,
      paymentId: local.paymentId,
      mercadoPagoPaymentId: local.id,
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
      await recordPaymentProviderAlert({
        code: 'PAID_AMOUNT_MISMATCH',
        priority: 'CRITICAL',
        tenantId: local.tenantId,
        storeId: local.storeId,
        orderId: local.orderId,
        paymentId: local.paymentId,
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
    await recordPaymentProviderAlert({
      code: 'PARTIAL_REFUND',
      priority: 'CRITICAL',
      tenantId: local.tenantId,
      storeId: local.storeId,
      orderId: local.orderId,
      paymentId: local.paymentId,
      mercadoPagoPaymentId: local.id,
    });
    return null;
  }
  const now = new Date();
  const historySource = syncSource === 'WEBHOOK' ? ('WEBHOOK' as const) : ('SYSTEM' as const);

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
        couponReservation: {
          select: { id: true, couponId: true, discount: true, status: true },
        },
        store: {
          select: {
            settings: {
              select: { estimatedTimeMinMinutes: true, estimatedTimeMaxMinutes: true },
            },
          },
        },
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
        expiresAt: safeExpiration(providerPayment?.date_of_expiration) ?? local.expiresAt,
        payerEmailCiphertext: null,
        payerEmailIv: null,
        lastErrorCode: mapped === 'REVIEW' ? 'UNMAPPED_STATUS' : null,
        lastSyncedAt: now,
      },
    });
    await resolveRecoveredPaymentProviderCreationAlerts(
      { tenantId: current.tenantId, storeId: current.storeId, recoveredAt: now },
      tx,
    );

    if (mapped === 'PENDING' || mapped === 'REVIEW') {
      if (mapped === 'REVIEW') {
        console.warn('[MP_STATUS_UNMAPPED]', {
          mercadoPagoPaymentId: local.id,
          status: providerOrder.status,
          statusDetail: providerOrder.status_detail,
        });
        await recordPaymentProviderAlert(
          {
            code: 'UNMAPPED_STATUS',
            priority: 'HIGH',
            tenantId: current.tenantId,
            storeId: current.storeId,
            orderId: current.id,
            paymentId: current.payment.id,
            mercadoPagoPaymentId: local.id,
          },
          tx,
        );
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

    const decision = decideMercadoPagoTransition({
      currentPaymentStatus: current.paymentStatus,
      currentOrderStatus: current.status,
      mapped,
    });
    if (decision.kind === 'NOOP') {
      return {
        orderId: current.id,
        storeId: current.storeId,
        orderNumber: current.orderNumber,
        paymentStatus: current.paymentStatus,
        eventIds: [],
        becameActionable: false,
      };
    }
    if (decision.kind === 'ALERT') {
      await recordPaymentProviderAlert(
        {
          code: decision.code,
          priority: decision.priority,
          tenantId: current.tenantId,
          storeId: current.storeId,
          orderId: current.id,
          paymentId: current.payment.id,
          mercadoPagoPaymentId: local.id,
        },
        tx,
      );
      return {
        orderId: current.id,
        storeId: current.storeId,
        orderNumber: current.orderNumber,
        paymentStatus: current.paymentStatus,
        eventIds: [],
        becameActionable: false,
      };
    }
    const nextPaymentStatus = decision.paymentStatus;
    const nextOrderStatus = decision.orderStatus;
    const reasonCode = decision.reasonCode;
    const cancellationReasonCode =
      nextOrderStatus === 'CANCELLED'
        ? reasonCode === 'PROVIDER_EXPIRED'
          ? ('PIX_EXPIRED' as const)
          : reasonCode === 'PROVIDER_CANCELLED'
            ? ('PROVIDER_CANCELLED' as const)
            : ('PAYMENT_NOT_IDENTIFIED' as const)
        : undefined;

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
        cancellationReasonCode,
        cancellationSource: nextOrderStatus === 'CANCELLED' ? historySource : undefined,
        operationalStartedAt: nextPaymentStatus === 'PAID' ? now : undefined,
        promisedFulfillmentMinAt:
          nextPaymentStatus === 'PAID' && current.store.settings
            ? new Date(now.getTime() + current.store.settings.estimatedTimeMinMinutes * 60_000)
            : undefined,
        promisedFulfillmentMaxAt:
          nextPaymentStatus === 'PAID' && current.store.settings
            ? new Date(now.getTime() + current.store.settings.estimatedTimeMaxMinutes * 60_000)
            : undefined,
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
      source: historySource,
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
          source: historySource,
          reasonCode: cancellationReasonCode,
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
    if (current.couponReservation && current.couponReservation.status !== 'CONSUMED') {
      if (nextPaymentStatus === 'PAID') {
        await tx.coupon.update({
          where: { id: current.couponReservation.couponId },
          data: { usageCount: { increment: 1 } },
        });
        await tx.couponUsage.create({
          data: {
            couponId: current.couponReservation.couponId,
            orderId: current.id,
            discount: current.couponReservation.discount,
          },
        });
        await tx.couponReservation.update({
          where: { id: current.couponReservation.id },
          data: { status: 'CONSUMED', consumedAt: now, releasedAt: null },
        });
      } else if (
        current.couponReservation.status === 'ACTIVE' &&
        (nextPaymentStatus === 'FAILED' || nextPaymentStatus === 'CANCELLED')
      ) {
        await tx.couponReservation.update({
          where: { id: current.couponReservation.id },
          data: {
            status: reasonCode === 'PROVIDER_EXPIRED' ? 'EXPIRED' : 'RELEASED',
            releasedAt: now,
          },
        });
      }
    }
    if (nextPaymentStatus === 'FAILED' || nextPaymentStatus === 'CANCELLED') {
      await tx.storeOfferUsage.updateMany({
        where: { orderId: current.id, status: 'RESERVED' },
        data: {
          status: reasonCode === 'PROVIDER_EXPIRED' ? 'EXPIRED' : 'RELEASED',
          releasedAt: now,
        },
      });
    }
    const providerAudit = await writeProviderAudit(tx, {
      tenantId: current.tenantId,
      storeId: current.storeId,
      entityId: local.id,
      orderId: current.id,
      previousStatus: current.paymentStatus,
      nextStatus: nextPaymentStatus,
      source: syncSource,
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
          metadata: {
            source: syncSource,
            lifecycle: 'BECAME_ACTIONABLE_AFTER_PAYMENT',
            previousStatus: current.status,
            nextStatus: 'PENDING',
          },
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

interface LocalMercadoPagoCreation {
  id: string;
  tenantId: string;
  storeId: string;
  orderId: string;
  connectionId: string;
  externalReference: string;
  idempotencyKey: string;
  lastErrorCode: string | null;
  createdAt: Date;
  credentialVersion: number;
  payerEmailCiphertext: string | null;
  payerEmailIv: string | null;
  providerOrderId: string | null;
  creationStatus: 'PENDING' | 'CREATED' | 'RETRYABLE_ERROR' | 'FAILED';
  qrCode: string | null;
  ticketUrl: string | null;
  expiresAt: Date | null;
  order: { total: number };
}

async function recordMercadoPagoCreatedOrder(
  local: LocalMercadoPagoCreation,
  providerOrder: MercadoPagoCreatedOrder,
  expectedProviderUserId: string,
) {
  const providerPayment = firstPayment(providerOrder);
  const providerPaymentAmount = amountToCents(providerPayment?.amount);
  const scopeMismatch =
    providerOrder.external_reference !== local.externalReference ||
    (providerOrder.user_id !== undefined && providerOrder.user_id !== expectedProviderUserId);
  const amountMismatch =
    (providerOrder.currency !== undefined && providerOrder.currency !== 'BRL') ||
    amountToCents(providerOrder.total_amount) !== local.order.total ||
    (providerPaymentAmount !== null && providerPaymentAmount !== local.order.total);

  if (scopeMismatch || amountMismatch) {
    const code = scopeMismatch ? 'PROVIDER_SCOPE_MISMATCH' : 'AMOUNT_MISMATCH';
    console.error(`[MP_${code}]`, {
      mercadoPagoPaymentId: local.id,
      orderId: local.orderId,
    });
    await getDb().mercadoPagoPayment.updateMany({
      where: { id: local.id, tenantId: local.tenantId, storeId: local.storeId },
      data: { lastErrorCode: code, lastSyncedAt: new Date() },
    });
    throw new BusinessRuleError('A resposta do provedor não corresponde ao pagamento local.');
  }

  await getDb().mercadoPagoPayment.updateMany({
    where: { id: local.id, tenantId: local.tenantId, storeId: local.storeId },
    data: {
      creationStatus: 'CREATED',
      providerOrderId: providerOrder.id,
      providerPaymentId: providerPayment?.id ?? null,
      providerStatus: providerOrder.status,
      providerStatusDetail: providerOrder.status_detail,
      qrCode: providerPayment?.payment_method.qr_code ?? local.qrCode,
      ticketUrl: providerPayment?.payment_method.ticket_url ?? local.ticketUrl,
      expiresAt: safeExpiration(providerPayment?.date_of_expiration) ?? local.expiresAt,
      payerEmailCiphertext: null,
      payerEmailIv: null,
      lastErrorCode: null,
      lastSyncedAt: new Date(),
    },
  });
}

async function fetchAndReconcileMercadoPagoOrder(
  local: LocalMercadoPagoCreation,
  initialCredential: MercadoPagoOrdersCredential,
  providerOrderId: string,
) {
  let credential = initialCredential;
  try {
    const providerOrder = await getMercadoPagoOrder({
      accessToken: credential.accessToken,
      orderId: providerOrderId,
    });
    return reconcileMercadoPagoOrder(providerOrder, credential.expectedProviderUserId);
  } catch (error) {
    if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
    credential = await getMercadoPagoOrdersCredential(local.connectionId, {
      allowReconciliation: true,
      forceRefresh: true,
    });
    try {
      const providerOrder = await getMercadoPagoOrder({
        accessToken: credential.accessToken,
        orderId: providerOrderId,
      });
      return reconcileMercadoPagoOrder(providerOrder, credential.expectedProviderUserId);
    } catch (retryError) {
      if (
        credential.source === 'OAUTH' &&
        retryError instanceof MercadoPagoApiError &&
        retryError.status === 401
      ) {
        await markMercadoPagoReauthRequired(local.connectionId, 'SECOND_401');
      }
      throw retryError;
    }
  }
}

async function recoverMercadoPagoOrderByExternalReference(
  local: LocalMercadoPagoCreation,
  initialCredential: MercadoPagoOrdersCredential,
) {
  const search = (accessToken: string) =>
    searchMercadoPagoOrders({
      accessToken,
      externalReference: local.externalReference,
      beginDate: new Date(local.createdAt.getTime() - 5 * 60 * 1_000),
      endDate: new Date(Date.now() + 5 * 60 * 1_000),
    });
  let result;
  let credential = initialCredential;
  try {
    result = await search(credential.accessToken);
  } catch (error) {
    if (!(error instanceof MercadoPagoApiError) || error.status !== 401) throw error;
    credential = await getMercadoPagoOrdersCredential(local.connectionId, {
      allowReconciliation: true,
      forceRefresh: true,
    });
    try {
      result = await search(credential.accessToken);
    } catch (retryError) {
      if (
        credential.source === 'OAUTH' &&
        retryError instanceof MercadoPagoApiError &&
        retryError.status === 401
      ) {
        await markMercadoPagoReauthRequired(local.connectionId, 'SECOND_401');
      }
      throw retryError;
    }
  }
  const matches = result.data.filter(
    (candidate) => candidate.external_reference === local.externalReference,
  );
  if (matches.length > 1) {
    console.error('[MP_AMBIGUOUS_EXTERNAL_REFERENCE]', {
      mercadoPagoPaymentId: local.id,
      matches: matches.length,
    });
    throw new AmbiguousProviderOrderError();
  }
  const providerOrder = matches[0];
  if (!providerOrder) return { found: false, result: null } as const;
  return {
    found: true,
    result: await reconcileMercadoPagoOrder(providerOrder, credential.expectedProviderUserId),
  } as const;
}

async function rotateMercadoPagoIdempotencyKey(
  local: LocalMercadoPagoCreation,
  currentKey: string,
) {
  const nextKey = `pl_${crypto.randomUUID()}`;
  const rotated = await getDb().mercadoPagoPayment.updateMany({
    where: {
      id: local.id,
      tenantId: local.tenantId,
      storeId: local.storeId,
      idempotencyKey: currentKey,
      providerOrderId: null,
    },
    data: { idempotencyKey: nextKey },
  });
  if (rotated.count === 1) return { idempotencyKey: nextKey, providerOrderId: null };

  const current = await getDb().mercadoPagoPayment.findUnique({
    where: { id: local.id },
    select: { idempotencyKey: true, providerOrderId: true },
  });
  if (!current) throw new NotFoundError('Pagamento Mercado Pago');
  return current;
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
            couponReservation: { select: { id: true, status: true } },
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
    const cancellationReasonCode =
      errorCode === 'PROVIDER_EXPIRED' ? 'PIX_EXPIRED' : 'ONLINE_PAYMENT_CREATION_FAILED';
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
        cancellationReasonCode,
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
        reasonCode: cancellationReasonCode,
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
    if (local.order.couponReservation?.status === 'ACTIVE') {
      await tx.couponReservation.update({
        where: { id: local.order.couponReservation.id },
        data: { status: 'RELEASED', releasedAt: now },
      });
    }
    await tx.storeOfferUsage.updateMany({
      where: { orderId: local.order.id, status: 'RESERVED' },
      data: { status: 'RELEASED', releasedAt: now },
    });
    const audit = await writeProviderAudit(tx, {
      tenantId: local.order.tenantId,
      storeId: local.order.storeId,
      entityId: local.id,
      orderId: local.order.id,
      previousStatus: 'PENDING',
      nextStatus: 'FAILED',
    });
    await recordPaymentProviderAlert(
      {
        code: `ORDER_CREATE_${errorCode}`.slice(0, 64),
        priority: 'HIGH',
        tenantId: local.order.tenantId,
        storeId: local.order.storeId,
        orderId: local.order.id,
        paymentId: local.payment.id,
        mercadoPagoPaymentId: local.id,
      },
      tx,
    );
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
      failureCode: errorCode,
    };
  });
}

export async function ensureMercadoPagoPixCreated(
  mercadoPagoPaymentId: string,
): Promise<MercadoPagoSyncResult | null> {
  const local = await getDb().mercadoPagoPayment.findUnique({
    where: { id: mercadoPagoPaymentId },
    include: {
      order: { select: { total: true, status: true, paymentStatus: true } },
      payment: { select: { status: true, provider: true } },
    },
  });
  if (!local) throw new NotFoundError('Pagamento Mercado Pago');

  const canCreateProviderCharge = () =>
    local.order.status === 'AWAITING_PAYMENT' &&
    local.order.paymentStatus === 'PENDING' &&
    local.payment.status === 'PENDING' &&
    local.payment.provider === 'MERCADO_PAGO';

  if (!local.providerOrderId && !canCreateProviderCharge()) {
    console.info('[MP_ORDER_CREATE_SKIPPED_LOCAL_FINAL_STATE]', {
      mercadoPagoPaymentId: local.id,
      orderId: local.orderId,
      orderStatus: local.order.status,
      orderPaymentStatus: local.order.paymentStatus,
      paymentStatus: local.payment.status,
    });
    return null;
  }

  let credential = await getMercadoPagoOrdersCredential(local.connectionId, {
    allowReconciliation: true,
  });
  if (local.providerOrderId) {
    return fetchAndReconcileMercadoPagoOrder(local, credential, local.providerOrderId);
  }

  let idempotencyKey = local.idempotencyKey;

  if (local.creationStatus === 'RETRYABLE_ERROR') {
    try {
      const recovered = await recoverMercadoPagoOrderByExternalReference(local, credential);
      if (recovered.found) return recovered.result;
    } catch (error) {
      const code = safeProviderErrorCode(error);
      await failCreation(local.id, code, true);
      console.warn('[MP_ORDER_RECOVERY_FAILED]', {
        mercadoPagoPaymentId: local.id,
        code,
      });
      return null;
    }
    if (local.lastErrorCode === 'idempotency_validation_failed') {
      const rotated = await rotateMercadoPagoIdempotencyKey(local, idempotencyKey);
      if (rotated.providerOrderId) {
        return fetchAndReconcileMercadoPagoOrder(local, credential, rotated.providerOrderId);
      }
      idempotencyKey = rotated.idempotencyKey;
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

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await getDb().order.findFirst({
      where: {
        id: local.orderId,
        tenantId: local.tenantId,
        storeId: local.storeId,
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        payment: { status: 'PENDING', provider: 'MERCADO_PAGO' },
      },
      select: { id: true },
    });
    if (!current) {
      console.info('[MP_ORDER_CREATE_SKIPPED_STATE_CHANGED]', {
        mercadoPagoPaymentId: local.id,
        orderId: local.orderId,
      });
      return null;
    }

    let createdOrder: MercadoPagoCreatedOrder;
    try {
      createdOrder = await createMercadoPagoPixOrder({
        accessToken: credential.accessToken,
        idempotencyKey,
        totalAmount: centsToAmount(local.order.total),
        externalReference: local.externalReference,
        payerEmail,
        environment: config.oauthEnvironment,
        expiration: MERCADO_PAGO_PIX_EXPIRATION,
      });
      console.info('[MP_ORDER_CREATED]', {
        mercadoPagoPaymentId: local.id,
        orderId: local.orderId,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0 && error instanceof MercadoPagoApiError && error.status === 401) {
        credential = await getMercadoPagoOrdersCredential(local.connectionId, {
          forceRefresh: true,
        });
        continue;
      }
      if (
        credential.source === 'OAUTH' &&
        attempt === 1 &&
        error instanceof MercadoPagoApiError &&
        error.status === 401
      ) {
        await markMercadoPagoReauthRequired(local.connectionId, 'SECOND_401');
      }

      if (error instanceof MercadoPagoApiError && error.code === 'idempotency_validation_failed') {
        try {
          const recovered = await recoverMercadoPagoOrderByExternalReference(local, credential);
          if (recovered.found) return recovered.result;
        } catch (recoveryError) {
          if (recoveryError instanceof AmbiguousProviderOrderError) lastError = recoveryError;
          break;
        }
        if (attempt === 0) {
          const rotated = await rotateMercadoPagoIdempotencyKey(local, idempotencyKey);
          if (rotated.providerOrderId) {
            return fetchAndReconcileMercadoPagoOrder(local, credential, rotated.providerOrderId);
          }
          idempotencyKey = rotated.idempotencyKey;
          continue;
        }
        break;
      }

      if (isRetryableMercadoPagoCreationError(error)) {
        try {
          const recovered = await recoverMercadoPagoOrderByExternalReference(local, credential);
          if (recovered.found) return recovered.result;
        } catch (recoveryError) {
          // A falha da busca não transforma uma criação originalmente ambígua
          // em falha definitiva. Mantemos o erro original, exceto quando a
          // própria busca comprova referências duplicadas.
          if (recoveryError instanceof AmbiguousProviderOrderError) {
            lastError = recoveryError;
          }
          break;
        }
      }
      if (attempt === 0 && canRepeatCreationImmediately(error)) {
        await waitBeforeCreationRetry(error);
        continue;
      }
      break;
    }

    await recordMercadoPagoCreatedOrder(local, createdOrder, credential.expectedProviderUserId);
    try {
      return await fetchAndReconcileMercadoPagoOrder(local, credential, createdOrder.id);
    } catch (error) {
      const code = safeProviderErrorCode(error);
      await getDb().mercadoPagoPayment.updateMany({
        where: { id: local.id, tenantId: local.tenantId, storeId: local.storeId },
        data: { lastErrorCode: code },
      });
      console.warn('[MP_ORDER_CANONICAL_SYNC_FAILED]', {
        mercadoPagoPaymentId: local.id,
        code,
      });
      return null;
    }
  }
  const retryable = isRetryableMercadoPagoCreationError(lastError);
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

export async function reconcilePendingMercadoPagoPayments(options?: {
  limit?: number;
  concurrency?: number;
}) {
  const db = getDb();
  const now = new Date();
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const concurrency = Math.min(Math.max(options?.concurrency ?? 3, 1), 5);
  const candidates = await db.mercadoPagoPayment.findMany({
    where: {
      payment: { status: 'PENDING' },
      order: { status: 'AWAITING_PAYMENT' },
      OR: [
        { creationStatus: { in: ['PENDING', 'RETRYABLE_ERROR'] } },
        {
          creationStatus: 'CREATED',
          providerStatus: { notIn: ['processed', 'failed', 'expired', 'canceled', 'refunded'] },
        },
      ],
    },
    orderBy: [{ lastSyncedAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true, providerOrderId: true, expiresAt: true, createdAt: true },
  });

  let next = 0;
  let synchronized = 0;
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (next < candidates.length) {
        const candidate = candidates[next++];
        if (!candidate) continue;
        try {
          const expired =
            (candidate.expiresAt && candidate.expiresAt <= now) ||
            (!candidate.providerOrderId &&
              now.getTime() - candidate.createdAt.getTime() > 35 * 60_000);
          if (expired && !candidate.providerOrderId) {
            await failCreation(candidate.id, 'PROVIDER_EXPIRED', false);
          } else {
            const result = await ensureMercadoPagoPixCreated(candidate.id);
            if (expired && result?.paymentStatus === 'PENDING') {
              await failCreation(candidate.id, 'PROVIDER_EXPIRED', false);
            }
          }
          synchronized += 1;
        } catch (error) {
          failed += 1;
          console.warn('[MP_PERIODIC_RECONCILIATION_FAILED]', {
            mercadoPagoPaymentId: candidate.id,
            code: safeProviderErrorCode(error),
          });
        }
      }
    }),
  );

  const expiredReservations = await db.couponReservation.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: now },
      order: { status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' },
    },
    data: { status: 'EXPIRED', releasedAt: now },
  });
  const releasedConnections = await db.storePaymentProviderConnection.updateMany({
    where: {
      provider: 'MERCADO_PAGO',
      status: 'DISCONNECTED',
      mercadoPagoPayments: { none: { payment: { status: 'PENDING' } } },
    },
    data: {
      accessTokenCiphertext: null,
      accessTokenIv: null,
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      tokenExpiresAt: null,
    },
  });
  return {
    selected: candidates.length,
    synchronized,
    failed,
    expiredReservations: expiredReservations.count,
    releasedConnections: releasedConnections.count,
  };
}
