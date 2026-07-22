import 'server-only';

import type {
  AuditAction,
  OrderCancellationReasonCode,
  OrderModality,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { assertOrderTransition } from '@/domain/orders/order-workflow';
import type { CancelOrderInput, OrderVersionInput } from '@/features/orders/schemas';
import { getDb } from '@/server/database/client';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  OrderPaymentConsistencyError,
  OrderUndoNotAllowedError,
} from '@/server/errors';
import * as orderAudit from './order-audit.service';
import type {
  OrderMutationContext,
  OrderMutationResult,
} from './order-mutation.types';

export type { OrderMutationContext, OrderMutationResult } from './order-mutation.types';

const ORDER_CONFLICT_MESSAGE =
  'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.';
const UNDO_WINDOW_MS = 2 * 60 * 1000;

interface OrderSnapshot {
  id: string;
  storeId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  modality: OrderModality;
  version: number;
  payment: {
    id: string;
    status: PaymentStatus;
    method: PaymentMethodType;
  } | null;
}

function conflict(): never {
  throw new ConflictError(ORDER_CONFLICT_MESSAGE);
}

function assertExpectedVersion(order: OrderSnapshot, expectedVersion: number): void {
  if (order.version !== expectedVersion) conflict();
}

function assertPaymentConsistency(order: OrderSnapshot): void {
  if (
    !order.payment ||
    order.payment.status !== order.paymentStatus ||
    order.payment.method !== order.paymentMethod
  ) {
    throw new OrderPaymentConsistencyError();
  }
}

async function getOrderSnapshot(
  tx: Prisma.TransactionClient,
  context: OrderMutationContext,
  orderId: string,
): Promise<OrderSnapshot> {
  const order = await tx.order.findFirst({
    where: {
      id: orderId,
      tenantId: context.tenantId,
      storeId: context.storeId,
    },
    select: {
      id: true,
      storeId: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      modality: true,
      version: true,
      payment: {
        select: {
          id: true,
          status: true,
          method: true,
        },
      },
    },
  });

  if (!order) throw new NotFoundError('Pedido');
  assertPaymentConsistency(order);
  return order;
}

function statusTimestampData(
  status: OrderStatus,
  changedAt: Date,
): Prisma.OrderUpdateManyMutationInput {
  switch (status) {
    case 'CONFIRMED':
      return { acceptedAt: changedAt };
    case 'PREPARING':
      return { preparingAt: changedAt };
    case 'READY':
      return { readyAt: changedAt };
    case 'OUT_FOR_DELIVERY':
      return { dispatchedAt: changedAt };
    case 'DELIVERED':
      return { deliveredAt: changedAt };
    case 'PENDING':
    case 'AWAITING_PAYMENT':
    case 'CANCELLED':
      return {};
  }
}

async function createStatusHistory(
  tx: Prisma.TransactionClient,
  context: OrderMutationContext,
  data: {
    orderId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    note?: string;
    reasonCode?: OrderCancellationReasonCode;
    versionFrom: number;
    versionTo: number;
    isUndo?: boolean;
    revertsHistoryId?: string;
  },
): Promise<void> {
  await tx.orderStatusHistory.create({
    data: {
      orderId: data.orderId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      note: data.note,
      reasonCode: data.reasonCode,
      versionFrom: data.versionFrom,
      versionTo: data.versionTo,
      changedBy: context.userId,
      changedById: context.userId,
      actorNameSnapshot: context.userName,
      source: 'DASHBOARD',
      isUndo: data.isUndo ?? false,
      revertsHistoryId: data.revertsHistoryId,
    },
  });
}

function auditActionForStatus(status: OrderStatus): AuditAction {
  switch (status) {
    case 'CONFIRMED':
      return 'ORDER_ACCEPTED';
    case 'PREPARING':
      return 'ORDER_PREPARATION_STARTED';
    case 'READY':
      return 'ORDER_READY';
    case 'OUT_FOR_DELIVERY':
      return 'ORDER_DISPATCHED';
    case 'DELIVERED':
      return 'ORDER_COMPLETED';
    case 'CANCELLED':
      return 'ORDER_CANCELLED';
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      return 'STATUS_CHANGE';
  }
}

async function transitionOrder(
  context: OrderMutationContext,
  input: OrderVersionInput,
  targetStatus: OrderStatus,
): Promise<OrderMutationResult> {
  return getDb().$transaction(async (tx) => {
    const order = await getOrderSnapshot(tx, context, input.orderId);
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderTransition(order, targetStatus);

    const changedAt = new Date();
    const confirmPaymentOnCompletion =
      targetStatus === 'DELIVERED' &&
      order.paymentMethod !== 'PIX' &&
      order.paymentStatus === 'PENDING';
    if (confirmPaymentOnCompletion && !context.canConfirmPayment) {
      throw new AuthorizationError(
        'Seu perfil não possui permissão para confirmar o pagamento na conclusão.',
      );
    }
    const nextPaymentStatus = confirmPaymentOnCompletion ? 'PAID' : order.paymentStatus;

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: context.tenantId,
        storeId: context.storeId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        version: input.expectedVersion,
      },
      data: {
        status: targetStatus,
        paymentStatus: nextPaymentStatus,
        statusChangedAt: changedAt,
        version: { increment: 1 },
        ...statusTimestampData(targetStatus, changedAt),
      },
    });
    if (updated.count !== 1) conflict();

    if (confirmPaymentOnCompletion) {
      const paymentUpdated = await tx.payment.updateMany({
        where: {
          orderId: order.id,
          method: order.paymentMethod,
          status: order.paymentStatus,
        },
        data: {
          status: 'PAID',
          paidAt: changedAt,
          confirmedBy: context.userId,
        },
      });
      if (paymentUpdated.count !== 1) conflict();
    }

    await createStatusHistory(tx, context, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: targetStatus,
      note: confirmPaymentOnCompletion
        ? 'Pagamento confirmado durante a conclusão do pedido'
        : undefined,
      versionFrom: input.expectedVersion,
      versionTo: input.expectedVersion + 1,
    });

    await orderAudit.writeOrderStatusAudit(tx, context, {
      orderId: order.id,
      action: auditActionForStatus(targetStatus),
      previousStatus: order.status,
      nextStatus: targetStatus,
      previousVersion: input.expectedVersion,
      nextVersion: input.expectedVersion + 1,
    });

    if (confirmPaymentOnCompletion) {
      await orderAudit.writePaymentAudit(tx, context, {
        orderId: order.id,
        paymentId: order.payment!.id,
        action: 'PAYMENT_CONFIRMED',
        previousStatus: order.paymentStatus,
        nextStatus: 'PAID',
        previousVersion: input.expectedVersion,
        nextVersion: input.expectedVersion + 1,
      });
    }

    return {
      orderId: order.id,
      storeId: order.storeId,
      status: targetStatus,
      paymentStatus: nextPaymentStatus,
      version: input.expectedVersion + 1,
      paymentUpdated: confirmPaymentOnCompletion,
    };
  });
}

export function acceptOrder(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return transitionOrder(context, input, 'CONFIRMED');
}

export function startOrderPreparation(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return transitionOrder(context, input, 'PREPARING');
}

export function markOrderReady(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return transitionOrder(context, input, 'READY');
}

export function dispatchOrder(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return transitionOrder(context, input, 'OUT_FOR_DELIVERY');
}

export function completeOrder(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return transitionOrder(context, input, 'DELIVERED');
}

export async function cancelOrder(
  context: OrderMutationContext,
  input: CancelOrderInput,
): Promise<OrderMutationResult> {
  return getDb().$transaction(async (tx) => {
    const order = await getOrderSnapshot(tx, context, input.orderId);
    assertExpectedVersion(order, input.expectedVersion);
    assertOrderTransition(order, 'CANCELLED');

    if (order.paymentStatus === 'PAID') {
      throw new BusinessRuleError(
        'Um pedido pago precisa ser reembolsado antes do cancelamento.',
      );
    }

    const changedAt = new Date();
    const cancelPayment = ['PENDING', 'CUSTOMER_REPORTED_PAID', 'FAILED'].includes(
      order.paymentStatus,
    );
    const nextPaymentStatus = cancelPayment ? 'CANCELLED' : order.paymentStatus;

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: context.tenantId,
        storeId: context.storeId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        version: input.expectedVersion,
      },
      data: {
        status: 'CANCELLED',
        paymentStatus: nextPaymentStatus,
        statusChangedAt: changedAt,
        cancelledAt: changedAt,
        cancelledById: context.userId,
        cancellationReasonCode: input.reasonCode,
        cancellationNote: input.note,
        cancellationSource: 'DASHBOARD',
        customerCancellationNoticeRequired: true,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) conflict();

    if (cancelPayment) {
      const paymentUpdated = await tx.payment.updateMany({
        where: {
          orderId: order.id,
          method: order.paymentMethod,
          status: order.paymentStatus,
        },
        data: { status: 'CANCELLED' },
      });
      if (paymentUpdated.count !== 1) conflict();
    }

    await createStatusHistory(tx, context, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      reasonCode: input.reasonCode,
      note: input.note,
      versionFrom: input.expectedVersion,
      versionTo: input.expectedVersion + 1,
    });

    await orderAudit.writeOrderStatusAudit(tx, context, {
      orderId: order.id,
      action: 'ORDER_CANCELLED',
      previousStatus: order.status,
      nextStatus: 'CANCELLED',
      previousVersion: input.expectedVersion,
      nextVersion: input.expectedVersion + 1,
      reasonCode: input.reasonCode,
      hasNote: Boolean(input.note),
    });

    if (cancelPayment) {
      await orderAudit.writePaymentAudit(tx, context, {
        orderId: order.id,
        paymentId: order.payment!.id,
        action: 'PAYMENT_CANCELLED',
        previousStatus: order.paymentStatus,
        nextStatus: 'CANCELLED',
        previousVersion: input.expectedVersion,
        nextVersion: input.expectedVersion + 1,
      });
    }

    return {
      orderId: order.id,
      storeId: order.storeId,
      status: 'CANCELLED',
      paymentStatus: nextPaymentStatus,
      version: input.expectedVersion + 1,
      paymentUpdated: cancelPayment,
    };
  });
}

const REVERSIBLE_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  CONFIRMED: 'PENDING',
  PREPARING: 'CONFIRMED',
  READY: 'PREPARING',
  OUT_FOR_DELIVERY: 'READY',
};

function revertedTimestampData(status: OrderStatus): Prisma.OrderUpdateManyMutationInput {
  switch (status) {
    case 'CONFIRMED':
      return { acceptedAt: null };
    case 'PREPARING':
      return { preparingAt: null };
    case 'READY':
      return { readyAt: null };
    case 'OUT_FOR_DELIVERY':
      return { dispatchedAt: null };
    case 'PENDING':
    case 'AWAITING_PAYMENT':
    case 'DELIVERED':
    case 'CANCELLED':
      return {};
  }
}

export async function undoLastOrderTransition(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return getDb().$transaction(async (tx) => {
    const order = await getOrderSnapshot(tx, context, input.orderId);
    assertExpectedVersion(order, input.expectedVersion);
    const latestChange = await tx.orderStatusHistory.findFirst({
      where: { orderId: order.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const previousStatus = REVERSIBLE_TRANSITIONS[order.status];
    const isRecent = latestChange
      ? Date.now() - latestChange.createdAt.getTime() <= UNDO_WINDOW_MS
      : false;

    if (
      !latestChange ||
      !previousStatus ||
      latestChange.fromStatus !== previousStatus ||
      latestChange.toStatus !== order.status ||
      latestChange.changedById !== context.userId ||
      latestChange.source !== 'DASHBOARD' ||
      latestChange.isUndo ||
      latestChange.versionFrom !== input.expectedVersion - 1 ||
      latestChange.versionTo !== input.expectedVersion ||
      !isRecent
    ) {
      throw new OrderUndoNotAllowedError();
    }

    const changedAt = new Date();
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: context.tenantId,
        storeId: context.storeId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        version: input.expectedVersion,
      },
      data: {
        status: previousStatus,
        statusChangedAt: changedAt,
        version: { increment: 1 },
        ...revertedTimestampData(order.status),
      },
    });
    if (updated.count !== 1) conflict();

    await createStatusHistory(tx, context, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: previousStatus,
      note: 'Alteração desfeita pelo painel',
      isUndo: true,
      revertsHistoryId: latestChange.id,
      versionFrom: input.expectedVersion,
      versionTo: input.expectedVersion + 1,
    });

    await orderAudit.writeOrderStatusAudit(tx, context, {
      orderId: order.id,
      action: 'ORDER_TRANSITION_UNDONE',
      previousStatus: order.status,
      nextStatus: previousStatus,
      previousVersion: input.expectedVersion,
      nextVersion: input.expectedVersion + 1,
      revertedHistoryId: latestChange.id,
    });

    return {
      orderId: order.id,
      storeId: order.storeId,
      status: previousStatus,
      paymentStatus: order.paymentStatus,
      version: input.expectedVersion + 1,
      paymentUpdated: false,
    };
  });
}
