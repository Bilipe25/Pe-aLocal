import 'server-only';

import type {
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
} from '@/server/errors';

const ORDER_CONFLICT_MESSAGE =
  'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.';
const UNDO_WINDOW_MS = 2 * 60 * 1000;

export interface OrderMutationContext {
  tenantId: string;
  storeId: string;
  userId: string;
  userName: string;
  canConfirmPayment: boolean;
}

export interface OrderMutationResult {
  orderId: string;
  storeId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  paymentUpdated: boolean;
}

interface OrderSnapshot {
  id: string;
  storeId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  modality: OrderModality;
  version: number;
  payment: {
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
    throw new BusinessRuleError(
      'Os dados de pagamento deste pedido estão inconsistentes. A operação foi bloqueada.',
    );
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
      changedBy: context.userId,
      changedById: context.userId,
      actorNameSnapshot: context.userName,
      source: 'DASHBOARD',
      isUndo: data.isUndo ?? false,
      revertsHistoryId: data.revertsHistoryId,
    },
  });
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
    });

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
    });

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
      !isRecent
    ) {
      throw new BusinessRuleError(
        'Esta alteração não pode mais ser desfeita. Atualize a central e revise o pedido.',
      );
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

export async function confirmManualPayment(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  return getDb().$transaction(async (tx) => {
    const order = await getOrderSnapshot(tx, context, input.orderId);
    assertExpectedVersion(order, input.expectedVersion);
    if (order.status === 'CANCELLED') {
      throw new BusinessRuleError('Um pedido cancelado não pode ser marcado como pago.');
    }
    if (!['PENDING', 'CUSTOMER_REPORTED_PAID'].includes(order.paymentStatus)) {
      throw new BusinessRuleError('Este pagamento não pode ser confirmado no estado atual.');
    }

    const paidAt = new Date();
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
        paymentStatus: 'PAID',
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) conflict();

    const paymentUpdated = await tx.payment.updateMany({
      where: {
        orderId: order.id,
        method: order.paymentMethod,
        status: order.paymentStatus,
      },
      data: {
        status: 'PAID',
        paidAt,
        confirmedBy: context.userId,
      },
    });
    if (paymentUpdated.count !== 1) conflict();

    return {
      orderId: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentStatus: 'PAID',
      version: input.expectedVersion + 1,
      paymentUpdated: true,
    };
  });
}
