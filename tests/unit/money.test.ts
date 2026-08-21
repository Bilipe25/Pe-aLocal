import { describe, expect, it } from 'vitest';

import {
  addCents,
  assertCheckoutFinancialInvariants,
  MAX_DATABASE_CENTS,
  MoneyArithmeticError,
  multiplyCents,
} from '@/domain/money';

describe('aritmética monetária', () => {
  it('rejeita overflow em soma e multiplicação', () => {
    expect(() => addCents(MAX_DATABASE_CENTS, 1)).toThrow(MoneyArithmeticError);
    expect(() => multiplyCents(MAX_DATABASE_CENTS, 2)).toThrow(MoneyArithmeticError);
  });

  it('valida totais, ajustes, grupos e valor do pagamento', () => {
    expect(() =>
      assertCheckoutFinancialInvariants({
        subtotal: 5_000,
        automaticDiscount: 500,
        couponDiscount: 200,
        discount: 700,
        deliveryFee: 300,
        total: 4_600,
        paymentAmount: 4_600,
        adjustments: [
          { type: 'COMBO', amount: 500, offerGroupLineId: 'combo-a' },
          { type: 'COUPON', amount: 200 },
        ],
        offerGroups: [{ lineId: 'combo-a', discountAmount: 500 }],
      }),
    ).not.toThrow();

    expect(() =>
      assertCheckoutFinancialInvariants({
        subtotal: 5_000,
        automaticDiscount: 500,
        couponDiscount: 200,
        discount: 700,
        deliveryFee: 300,
        total: 4_600,
        paymentAmount: 4_599,
        adjustments: [{ type: 'COMBO', amount: 500, offerGroupLineId: 'combo-a' }],
        offerGroups: [{ lineId: 'combo-a', discountAmount: 499 }],
      }),
    ).toThrow(MoneyArithmeticError);
  });

  it('mantém Order.discount e Payment.amount consistentes com desconto manual', () => {
    expect(() =>
      assertCheckoutFinancialInvariants({
        subtotal: 5_000,
        automaticDiscount: 500,
        couponDiscount: 200,
        manualDiscount: 430,
        discount: 1_130,
        deliveryFee: 300,
        total: 4_170,
        paymentAmount: 4_170,
        adjustments: [
          { type: 'COMBO', amount: 500, offerGroupLineId: 'combo-a' },
          { type: 'COUPON', amount: 200 },
          { type: 'MANUAL_DISCOUNT', amount: 430 },
        ],
        offerGroups: [{ lineId: 'combo-a', discountAmount: 500 }],
      }),
    ).not.toThrow();
  });
});
