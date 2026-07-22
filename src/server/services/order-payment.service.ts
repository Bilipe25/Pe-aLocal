import 'server-only';

import type {
  AuditAction,
  OrderChangeSource,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import {
  assertPaymentTransition,
  getPaymentTransitionTarget,
  type PaymentOperation,
} from '@/domain/orders/payment-workflow';
import type {
  MarkPaymentFailedInput,
  OrderVersionInput,
  RefundPaymentInput,
} from '@/features/orders/schemas';
import { getDb } from '@/server/database/client';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  OrderPaymentConsistencyError,
} from '@/server/errors';
import * as orderAudit from './order-audit.service';
import type { OrderMutationContext, OrderMutationResult } from './order-mutation.types';
import { appendOrderOutboxEvent } from './order-outbox.service';

const ORDER_CONFLICT_MESSAGE =
  'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.';

interface PaymentOrderSnapshot {
  id: string;
  tenantId: string;
  storeId: string;
  orderNumber: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  version: number;
  payment: {
    id: string;
    status: PaymentStatus;
    method: PaymentMethodType;
    amount: number;
  } | null;
}

interface PaymentActor {
  tenantId: string;
  storeId: string;
  userId: string | null;
  source: OrderChangeSource;
}

interface TransitionOptions {
  operation: PaymentOperation;
  expectedVersion: number;
  actor: PaymentActor;
  reasonCode?: string;
  note?: string;
}

function conflict(): never {
  throw new ConflictError(ORDER_CONFLICT_MESSAGE);
}

function assertPaymentConsistency(order: PaymentOrderSnapshot): void {
  if (
    !order.payment ||
    order.payment.status !== order.paymentStatus ||
    order.payment.method !== order.paymentMethod ||
    order.payment.amount !== order.total
  ) {
    throw new OrderPaymentConsistencyError();
  }
}

function auditAction(operation: PaymentOperation): AuditAction {
  switch (operation) {
    case 'REPORT_BY_CUSTOMER':
      return 'PAYMENT_REPORTED';
    case 'CONFIRM_MANUALLY':
    case 'CONFIRM_ON_COMPLETION':
      return 'PAYMENT_CONFIRMED';
    case 'MARK_FAILED':
      return 'PAYMENT_FAILED';
    case 'CANCEL':
      return 'PAYMENT_CANCELLED';
    case 'REFUND':
      return 'PAYMENT_REFUNDED';
    case 'RETRY_FAILED':
      return 'UPDATE';
  }
}

function paymentMutationData(
  order: PaymentOrderSnapshot,
  options: TransitionOptions,
  changedAt: Date,
): Prisma.PaymentUpdateManyMutationInput {
  const status = getPaymentTransitionTarget(options.operation);
  const common = { status };

  switch (options.operation) {
    case 'REPORT_BY_CUSTOMER':
      return { ...common, reportedAt: changedAt };
    case 'CONFIRM_MANUALLY':
    case 'CONFIRM_ON_COMPLETION':
      return {
        ...common,
        paidAt: changedAt,
        confirmedBy: options.actor.userId,
        failedAt: null,
        failureReasonCode: null,
        failureNote: null,
      };
    case 'MARK_FAILED':
      return {
        ...common,
        failedAt: changedAt,
        failureReasonCode: options.reasonCode,
        failureNote: options.note,
      };
    case 'RETRY_FAILED':
      return {
        ...common,
        failedAt: null,
        failureReasonCode: null,
        failureNote: null,
      };
    case 'CANCEL':
      return { ...common, cancelledAt: changedAt };
    case 'REFUND':
      return {
        ...common,
        refundedAt: changedAt,
        refundedBy: options.actor.userId,
        refundReasonCode: options.reasonCode,
        refundNote: options.note,
        refundAmount: order.payment!.amount,
      };
  }
}

async function transitionPayment(
  tx: Prisma.TransactionClient,
  order: PaymentOrderSnapshot,
  options: TransitionOptions,
): Promise<OrderMutationResult> {
  if (order.version !== options.expectedVersion) conflict();
  assertPaymentConsistency(order);
  assertPaymentTransition(
    {
      status: order.paymentStatus,
      method: order.paymentMethod,
      orderStatus: order.status,
    },
    options.operation,
  );

  const nextStatus = getPaymentTransitionTarget(options.operation);
  const nextVersion = options.expectedVersion + 1;
  const changedAt = new Date();
  const updated = await tx.order.updateMany({
    where: {
      id: order.id,
      tenantId: options.actor.tenantId,
      storeId: options.actor.storeId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      version: options.expectedVersion,
    },
    data: { paymentStatus: nextStatus, version: { increment: 1 } },
  });
  if (updated.count !== 1) conflict();

  const paymentUpdated = await tx.payment.updateMany({
    where: {
      id: order.payment!.id,
      orderId: order.id,
      method: order.paymentMethod,
      status: order.paymentStatus,
      amount: order.total,
    },
    data: paymentMutationData(order, options, changedAt),
  });
  if (paymentUpdated.count !== 1) conflict();

  const paymentAuditId = await orderAudit.writePaymentAudit(tx, options.actor, {
    orderId: order.id,
    paymentId: order.payment!.id,
    action: auditAction(options.operation),
    previousStatus: order.paymentStatus,
    nextStatus,
    previousVersion: options.expectedVersion,
    nextVersion,
    source: options.actor.source,
    reasonCode: options.reasonCode,
    hasNote: options.note !== undefined,
  });
  const outboxEvent = await appendOrderOutboxEvent(tx, {
    tenantId: options.actor.tenantId,
    storeId: options.actor.storeId,
    orderId: order.id,
    auditLogId: paymentAuditId,
    eventType: 'PAYMENT_UPDATED',
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: nextStatus,
    aggregateVersion: nextVersion,
    occurredAt: changedAt,
  });

  return {
    orderId: order.id,
    storeId: order.storeId,
    status: order.status,
    paymentStatus: nextStatus,
    version: nextVersion,
    paymentUpdated: true,
    outboxEventIds: [outboxEvent.id],
  };
}

async function getScopedOrder(
  tx: Prisma.TransactionClient,
  context: OrderMutationContext,
  orderId: string,
): Promise<PaymentOrderSnapshot> {
  const order = await tx.order.findFirst({
    where: { id: orderId, tenantId: context.tenantId, storeId: context.storeId },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderNumber: true,
      total: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      version: true,
      payment: { select: { id: true, status: true, method: true, amount: true } },
    },
  });
  if (!order) throw new NotFoundError('Pedido');
  return order;
}

function dashboardActor(context: OrderMutationContext): PaymentActor {
  return {
    tenantId: context.tenantId,
    storeId: context.storeId,
    userId: context.userId,
    source: 'DASHBOARD',
  };
}

export async function confirmManualPayment(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  if (!context.canConfirmPayment) {
    throw new AuthorizationError('Seu perfil não possui permissão para confirmar pagamentos.');
  }
  return getDb().$transaction(async (tx) => {
    const order = await getScopedOrder(tx, context, input.orderId);
    if (order.status === 'CANCELLED') {
      throw new BusinessRuleError('Um pedido cancelado não pode ser marcado como pago.');
    }
    return transitionPayment(tx, order, {
      operation: 'CONFIRM_MANUALLY',
      expectedVersion: input.expectedVersion,
      actor: dashboardActor(context),
    });
  });
}

export async function markPaymentFailed(
  context: OrderMutationContext,
  input: MarkPaymentFailedInput,
): Promise<OrderMutationResult> {
  if (!context.canConfirmPayment) {
    throw new AuthorizationError('Seu perfil não possui permissão para revisar pagamentos.');
  }
  return getDb().$transaction(async (tx) =>
    transitionPayment(tx, await getScopedOrder(tx, context, input.orderId), {
      operation: 'MARK_FAILED',
      expectedVersion: input.expectedVersion,
      actor: dashboardActor(context),
      reasonCode: input.reasonCode,
      note: input.note,
    }),
  );
}

export async function retryFailedPayment(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  if (!context.canConfirmPayment) {
    throw new AuthorizationError('Seu perfil não possui permissão para revisar pagamentos.');
  }
  return getDb().$transaction(async (tx) =>
    transitionPayment(tx, await getScopedOrder(tx, context, input.orderId), {
      operation: 'RETRY_FAILED',
      expectedVersion: input.expectedVersion,
      actor: dashboardActor(context),
    }),
  );
}

export async function refundPayment(
  context: OrderMutationContext,
  input: RefundPaymentInput,
): Promise<OrderMutationResult> {
  if (!context.canRefundPayment) {
    throw new AuthorizationError('Seu perfil não possui permissão para registrar reembolsos.');
  }
  return getDb().$transaction(async (tx) =>
    transitionPayment(tx, await getScopedOrder(tx, context, input.orderId), {
      operation: 'REFUND',
      expectedVersion: input.expectedVersion,
      actor: dashboardActor(context),
      reasonCode: input.reasonCode,
      note: input.note,
    }),
  );
}

export async function reportCustomerPixPayment(publicToken: string): Promise<OrderMutationResult> {
  return getDb().$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { publicToken },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        orderNumber: true,
        total: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        version: true,
        payment: { select: { id: true, status: true, method: true, amount: true } },
      },
    });
    if (!order) throw new NotFoundError('Pedido');
    assertPaymentConsistency(order);

    if (order.paymentStatus === 'CUSTOMER_REPORTED_PAID' || order.paymentStatus === 'PAID') {
      return {
        orderId: order.id,
        storeId: order.storeId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        version: order.version,
        paymentUpdated: false,
        outboxEventIds: [],
      };
    }

    return transitionPayment(tx, order, {
      operation: 'REPORT_BY_CUSTOMER',
      expectedVersion: order.version,
      actor: {
        tenantId: order.tenantId,
        storeId: order.storeId,
        userId: null,
        source: 'CUSTOMER',
      },
    });
  });
}
