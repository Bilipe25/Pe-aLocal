export const DINING_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
export const DINING_SERVICE_REQUEST_COOLDOWN_MS = 45_000;

export async function diningSessionTokenFingerprint(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export type DiningServiceRequestType = 'ASSISTANCE' | 'BILL';

export interface DiningSessionFinancialOrder {
  id: string;
  status:
    | 'PENDING'
    | 'AWAITING_PAYMENT'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED';
  paymentStatus:
    'PENDING' | 'CUSTOMER_REPORTED_PAID' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  total: number;
}

export interface DiningSessionFinancialSummary {
  orderCount: number;
  consideredOrderCount: number;
  cancelledOrderCount: number;
  totalConsideredCents: number;
  paidCents: number;
  pendingCents: number;
  refundedCents: number;
  paymentsRequiringAction: number;
}

/**
 * A conta é uma projeção dos Orders e do Payment oficial de cada Order.
 * Cancelados não entram; reembolso integral zera o valor considerado; qualquer
 * pagamento não PAID/REFUNDED permanece pendente para a operação.
 */
export function buildDiningSessionFinancialSummary(
  orders: readonly DiningSessionFinancialOrder[],
): DiningSessionFinancialSummary {
  return orders.reduce<DiningSessionFinancialSummary>(
    (summary, order) => {
      summary.orderCount += 1;
      if (order.status === 'CANCELLED') {
        summary.cancelledOrderCount += 1;
        if (order.paymentStatus === 'REFUNDED') {
          summary.refundedCents += order.total;
        } else if (order.paymentStatus !== 'CANCELLED') {
          summary.paymentsRequiringAction += 1;
        }
        return summary;
      }

      summary.consideredOrderCount += 1;
      if (order.paymentStatus === 'REFUNDED') {
        summary.refundedCents += order.total;
        return summary;
      }

      summary.totalConsideredCents += order.total;
      if (order.paymentStatus === 'PAID') {
        summary.paidCents += order.total;
      } else {
        summary.pendingCents += order.total;
        summary.paymentsRequiringAction += 1;
      }
      return summary;
    },
    {
      orderCount: 0,
      consideredOrderCount: 0,
      cancelledOrderCount: 0,
      totalConsideredCents: 0,
      paidCents: 0,
      pendingCents: 0,
      refundedCents: 0,
      paymentsRequiringAction: 0,
    },
  );
}

export function isDiningSessionOrderTerminal(order: DiningSessionFinancialOrder) {
  return order.status === 'DELIVERED' || order.status === 'CANCELLED';
}

export function isDiningSessionPaymentResolved(order: DiningSessionFinancialOrder) {
  if (order.status === 'CANCELLED') {
    return order.paymentStatus === 'CANCELLED' || order.paymentStatus === 'REFUNDED';
  }
  return order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED';
}

export interface DiningSessionCloseEvaluation {
  canClose: boolean;
  activeOrderCount: number;
  paymentsRequiringAction: number;
  openRequestCount: number;
  message: string | null;
}

export function evaluateDiningSessionClose(input: {
  orders: readonly DiningSessionFinancialOrder[];
  openRequestCount: number;
}): DiningSessionCloseEvaluation {
  const activeOrderCount = input.orders.filter(
    (order) => !isDiningSessionOrderTerminal(order),
  ).length;
  const paymentsRequiringAction = input.orders.filter(
    (order) => !isDiningSessionPaymentResolved(order),
  ).length;

  let message: string | null = null;
  if (activeOrderCount > 0) {
    message = `Esta mesa ainda possui ${activeOrderCount} ${activeOrderCount === 1 ? 'pedido em andamento' : 'pedidos em andamento'}.`;
  } else if (paymentsRequiringAction > 0) {
    message = `Ainda existe ${paymentsRequiringAction} ${paymentsRequiringAction === 1 ? 'pagamento pendente' : 'pagamentos pendentes'}.`;
  } else if (input.openRequestCount > 0) {
    message = `Resolva ${input.openRequestCount} ${input.openRequestCount === 1 ? 'solicitação aberta' : 'solicitações abertas'} antes de fechar a mesa.`;
  }

  return {
    canClose: message === null,
    activeOrderCount,
    paymentsRequiringAction,
    openRequestCount: input.openRequestCount,
    message,
  };
}

export function canAutoRolloverDiningSession(input: {
  orders: readonly DiningSessionFinancialOrder[];
  openRequestCount: number;
}) {
  return input.orders.length > 0 && evaluateDiningSessionClose(input).canClose;
}
