import { BusinessRuleError } from '@/server/errors';
import type { OrderModality, OrderStatus, PaymentMethod, PaymentStatus } from '@/types';

export interface OrderWorkflowContext {
  readonly status: OrderStatus;
  readonly modality: OrderModality;
  readonly paymentMethod: PaymentMethod;
  readonly paymentStatus: PaymentStatus;
}

export type OrderOperationalAction =
  | 'CONFIRM_ORDER'
  | 'START_PREPARATION'
  | 'MARK_ORDER_READY'
  | 'DISPATCH_FOR_DELIVERY'
  | 'CONFIRM_PAYMENT'
  | 'COMPLETE_PICKUP'
  | 'COMPLETE_DELIVERY';

type OperationalOrderStatus = Exclude<OrderStatus, 'AWAITING_PAYMENT'>;

const FORWARD_TRANSITIONS: Record<OperationalOrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED'],
  CONFIRMED: ['PREPARING'],
  PREPARING: ['READY'],
  READY: [],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const ACTION_LABELS: Record<OrderOperationalAction, string> = {
  CONFIRM_ORDER: 'Aceitar pedido',
  START_PREPARATION: 'Iniciar preparo',
  MARK_ORDER_READY: 'Marcar como pronto',
  DISPATCH_FOR_DELIVERY: 'Despachar para entrega',
  CONFIRM_PAYMENT: 'Confirmar pagamento',
  COMPLETE_PICKUP: 'Concluir retirada',
  COMPLETE_DELIVERY: 'Concluir entrega',
};

function assertOperationalStatus(status: OrderStatus): asserts status is OperationalOrderStatus {
  if (status === 'AWAITING_PAYMENT') {
    throw new BusinessRuleError(
      'Aguardando pagamento não é um estado operacional do pedido.',
    );
  }
}

function canCompleteOrder(context: OrderWorkflowContext): boolean {
  if (context.paymentMethod === 'PIX') {
    return context.paymentStatus === 'PAID';
  }

  return context.paymentStatus === 'PENDING' || context.paymentStatus === 'PAID';
}

export function getAllowedOrderTransitions(
  context: OrderWorkflowContext,
): readonly OrderStatus[] {
  assertOperationalStatus(context.status);

  if (context.status === 'DELIVERED' || context.status === 'CANCELLED') {
    return [];
  }

  let forwardTransitions = FORWARD_TRANSITIONS[context.status];

  if (context.status === 'READY') {
    forwardTransitions =
      context.modality === 'DELIVERY'
        ? ['OUT_FOR_DELIVERY']
        : canCompleteOrder(context)
          ? ['DELIVERED']
          : [];
  } else if (context.status === 'OUT_FOR_DELIVERY' && !canCompleteOrder(context)) {
    forwardTransitions = [];
  }

  return [...forwardTransitions, 'CANCELLED'];
}

export function canTransitionOrder(
  context: OrderWorkflowContext,
  nextStatus: OrderStatus,
): boolean {
  if (context.status === 'AWAITING_PAYMENT' || nextStatus === 'AWAITING_PAYMENT') {
    return false;
  }

  return getAllowedOrderTransitions(context).includes(nextStatus);
}

export function assertOrderTransition(
  context: OrderWorkflowContext,
  nextStatus: OrderStatus,
): void {
  assertOperationalStatus(context.status);

  if (nextStatus === 'AWAITING_PAYMENT') {
    throw new BusinessRuleError(
      'Aguardando pagamento não é um estado operacional do pedido.',
    );
  }

  const isCompletionStep =
    nextStatus === 'DELIVERED' &&
    ((context.status === 'READY' && context.modality === 'PICKUP') ||
      context.status === 'OUT_FOR_DELIVERY');

  if (isCompletionStep && !canCompleteOrder(context)) {
    if (context.paymentMethod === 'PIX') {
      throw new BusinessRuleError('O pagamento via PIX deve estar confirmado para concluir o pedido.');
    }

    throw new BusinessRuleError('O pagamento deve estar pendente ou pago para concluir o pedido.');
  }

  if (!canTransitionOrder(context, nextStatus)) {
    throw new BusinessRuleError(
      `Não é permitido alterar o pedido de ${context.status} para ${nextStatus}.`,
    );
  }
}

export function getNextOperationalAction(
  context: OrderWorkflowContext,
): OrderOperationalAction | null {
  assertOperationalStatus(context.status);

  switch (context.status) {
    case 'PENDING':
      return 'CONFIRM_ORDER';
    case 'CONFIRMED':
      return 'START_PREPARATION';
    case 'PREPARING':
      return 'MARK_ORDER_READY';
    case 'READY':
      if (context.modality === 'DELIVERY') {
        return 'DISPATCH_FOR_DELIVERY';
      }
      return canCompleteOrder(context) ? 'COMPLETE_PICKUP' : 'CONFIRM_PAYMENT';
    case 'OUT_FOR_DELIVERY':
      return canCompleteOrder(context) ? 'COMPLETE_DELIVERY' : 'CONFIRM_PAYMENT';
    case 'DELIVERED':
    case 'CANCELLED':
      return null;
  }
}

export function getOrderWorkflowLabel(action: OrderOperationalAction): string {
  return ACTION_LABELS[action];
}
