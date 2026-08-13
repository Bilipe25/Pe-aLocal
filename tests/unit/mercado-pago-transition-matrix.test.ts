import { describe, expect, it } from 'vitest';

import { decideMercadoPagoTransition } from '@/lib/mercado-pago/transition-matrix';

describe('Mercado Pago transition matrix', () => {
  it('never downgrades a paid payment', () => {
    expect(
      decideMercadoPagoTransition({
        currentPaymentStatus: 'PAID',
        currentOrderStatus: 'PREPARING',
        mapped: 'FAILED',
      }),
    ).toEqual({ kind: 'ALERT', code: 'NON_MONOTONIC_AFTER_PAID', priority: 'CRITICAL' });
  });

  it('accepts only a full refund after paid', () => {
    expect(
      decideMercadoPagoTransition({
        currentPaymentStatus: 'PAID',
        currentOrderStatus: 'DELIVERED',
        mapped: 'REFUNDED',
      }),
    ).toEqual({ kind: 'TRANSITION', paymentStatus: 'REFUNDED', orderStatus: 'DELIVERED' });
  });

  it('raises a critical alert when approval arrives after local cancellation', () => {
    expect(
      decideMercadoPagoTransition({
        currentPaymentStatus: 'CANCELLED',
        currentOrderStatus: 'CANCELLED',
        mapped: 'PAID',
      }),
    ).toEqual({ kind: 'ALERT', code: 'PAID_AFTER_LOCAL_FINAL_STATE', priority: 'CRITICAL' });
  });
});
