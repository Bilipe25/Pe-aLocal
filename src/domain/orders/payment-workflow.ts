import { BusinessRuleError } from '@/server/errors';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/types';

export type PaymentOperation =
  | 'REPORT_BY_CUSTOMER'
  | 'CONFIRM_MANUALLY'
  | 'CONFIRM_ON_COMPLETION'
  | 'MARK_FAILED'
  | 'RETRY_FAILED'
  | 'CANCEL'
  | 'REFUND';

export interface PaymentWorkflowContext {
  readonly status: PaymentStatus;
  readonly method: PaymentMethod;
  readonly orderStatus: OrderStatus;
}

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['CUSTOMER_REPORTED_PAID', 'PAID', 'CANCELLED'],
  CUSTOMER_REPORTED_PAID: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED'],
  FAILED: ['PENDING', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

const OPERATION_TARGET: Record<PaymentOperation, PaymentStatus> = {
  REPORT_BY_CUSTOMER: 'CUSTOMER_REPORTED_PAID',
  CONFIRM_MANUALLY: 'PAID',
  CONFIRM_ON_COMPLETION: 'PAID',
  MARK_FAILED: 'FAILED',
  RETRY_FAILED: 'PENDING',
  CANCEL: 'CANCELLED',
  REFUND: 'REFUNDED',
};

const OPERATION_LABELS: Record<PaymentOperation, string> = {
  REPORT_BY_CUSTOMER: 'Informar pagamento Pix',
  CONFIRM_MANUALLY: 'Confirmar pagamento',
  CONFIRM_ON_COMPLETION: 'Confirmar pagamento na conclusão',
  MARK_FAILED: 'Marcar pagamento como não identificado',
  RETRY_FAILED: 'Reabrir pagamento para análise',
  CANCEL: 'Cancelar pagamento',
  REFUND: 'Registrar reembolso integral',
};

function operationMatchesMethod(
  context: PaymentWorkflowContext,
  operation: PaymentOperation,
): boolean {
  switch (operation) {
    case 'REPORT_BY_CUSTOMER':
    case 'MARK_FAILED':
    case 'RETRY_FAILED':
      return context.method === 'PIX';
    case 'CONFIRM_MANUALLY':
      return context.method === 'PIX' || context.method === 'CASH';
    case 'CONFIRM_ON_COMPLETION':
      return (
        (context.method === 'CASH' || context.method === 'CARD_ON_DELIVERY') &&
        (context.orderStatus === 'READY' || context.orderStatus === 'OUT_FOR_DELIVERY')
      );
    case 'CANCEL':
    case 'REFUND':
      return true;
  }
}

export function getAllowedPaymentTransitions(
  context: PaymentWorkflowContext,
): readonly PaymentStatus[] {
  if (context.orderStatus === 'CANCELLED') return [];
  return PAYMENT_TRANSITIONS[context.status];
}

export function canTransitionPayment(
  context: PaymentWorkflowContext,
  operation: PaymentOperation,
): boolean {
  const target = OPERATION_TARGET[operation];
  if (!getAllowedPaymentTransitions(context).includes(target)) return false;
  if (!operationMatchesMethod(context, operation)) return false;

  if (context.orderStatus === 'DELIVERED' && operation !== 'REFUND') {
    return false;
  }

  return true;
}

export function assertPaymentTransition(
  context: PaymentWorkflowContext,
  operation: PaymentOperation,
): void {
  if (!canTransitionPayment(context, operation)) {
    throw new BusinessRuleError(
      `A operação "${getPaymentWorkflowLabel(operation)}" não é permitida para este pagamento.`,
    );
  }
}

export function getPaymentTransitionTarget(operation: PaymentOperation): PaymentStatus {
  return OPERATION_TARGET[operation];
}

export function getPaymentWorkflowLabel(operation: PaymentOperation): string {
  return OPERATION_LABELS[operation];
}
