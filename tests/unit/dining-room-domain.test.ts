import { describe, expect, it } from 'vitest';

import {
  buildDiningSessionFinancialSummary,
  canAutoRolloverDiningSession,
  evaluateDiningSessionClose,
} from '@/domain/dining-room';

const order = (
  id: string,
  status: 'PENDING' | 'AWAITING_PAYMENT' | 'DELIVERED' | 'CANCELLED',
  paymentStatus: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED',
  total: number,
) => ({ id, status, paymentStatus, total });

describe('domínio da sessão de mesa', () => {
  it('deriva total, pago, pendente, cancelado e reembolsado sem duplicar saldo', () => {
    const summary = buildDiningSessionFinancialSummary([
      order('1', 'DELIVERED', 'PAID', 4_200),
      order('2', 'PENDING', 'PENDING', 3_190),
      order('3', 'AWAITING_PAYMENT', 'PENDING', 1_800),
      order('4', 'CANCELLED', 'CANCELLED', 2_000),
      order('5', 'DELIVERED', 'REFUNDED', 1_500),
    ]);

    expect(summary).toEqual({
      orderCount: 5,
      consideredOrderCount: 4,
      cancelledOrderCount: 1,
      totalConsideredCents: 9_190,
      paidCents: 4_200,
      pendingCents: 4_990,
      refundedCents: 1_500,
      paymentsRequiringAction: 2,
    });
  });

  it('bloqueia fechamento por pedido, depois pagamento e depois request', () => {
    expect(
      evaluateDiningSessionClose({
        orders: [order('1', 'PENDING', 'PENDING', 1_000)],
        openRequestCount: 0,
      }),
    ).toMatchObject({ canClose: false, activeOrderCount: 1 });
    expect(
      evaluateDiningSessionClose({
        orders: [order('1', 'DELIVERED', 'PENDING', 1_000)],
        openRequestCount: 0,
      }),
    ).toMatchObject({ canClose: false, paymentsRequiringAction: 1 });
    expect(
      evaluateDiningSessionClose({
        orders: [order('1', 'DELIVERED', 'PAID', 1_000)],
        openRequestCount: 1,
      }),
    ).toMatchObject({ canClose: false, openRequestCount: 1 });
  });

  it('sinaliza pagamento de pedido cancelado que ainda precisa de resolução sem criar saldo devido', () => {
    const summary = buildDiningSessionFinancialSummary([order('1', 'CANCELLED', 'PAID', 2_500)]);
    expect(summary).toMatchObject({
      totalConsideredCents: 0,
      paidCents: 0,
      pendingCents: 0,
      paymentsRequiringAction: 1,
    });
  });

  it('só permite rollover quando existe histórico e tudo está resolvido', () => {
    expect(canAutoRolloverDiningSession({ orders: [], openRequestCount: 0 })).toBe(false);
    expect(
      canAutoRolloverDiningSession({
        orders: [order('1', 'DELIVERED', 'PAID', 1_000), order('2', 'CANCELLED', 'CANCELLED', 500)],
        openRequestCount: 0,
      }),
    ).toBe(true);
  });
});
