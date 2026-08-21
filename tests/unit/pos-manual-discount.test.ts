import { describe, expect, it } from 'vitest';

import {
  applyAuthorizedPosManualDiscount,
  type ResolvedCheckoutQuote,
} from '@/server/services/checkout-quote.service';

function quote(overrides: Partial<ResolvedCheckoutQuote> = {}): ResolvedCheckoutQuote {
  return {
    quoteFingerprint: 'a'.repeat(64),
    storeId: 'store-a',
    storeSlug: 'loja-a',
    tenantId: 'tenant-a',
    lines: [],
    offerGroups: [],
    adjustments: [
      {
        type: 'CART_DISCOUNT',
        sourceId: 'offer-a',
        sourceVersion: 1,
        label: 'Oferta',
        amount: 500,
      },
      {
        type: 'COUPON',
        sourceId: 'coupon-a',
        sourceVersion: null,
        label: 'Cupom',
        amount: 200,
      },
    ],
    subtotal: 5_000,
    automaticDiscount: 500,
    couponDiscount: 200,
    manualDiscount: 0,
    discount: 700,
    deliveryFee: 300,
    total: 4_600,
    minOrderValue: 0,
    missingForMinimum: 0,
    deliveryZoneId: null,
    deliveryZoneName: null,
    promisedFulfillmentMinAt: new Date(0).toISOString(),
    promisedFulfillmentMaxAt: new Date(0).toISOString(),
    coupon: { code: 'MENOS2', discount: 200 },
    couponId: 'coupon-a',
    issues: [],
    canCheckout: true,
    estimatedMinMinutes: 30,
    estimatedMaxMinutes: 50,
    ...overrides,
  };
}

describe('pricing de desconto manual do PDV', () => {
  it('aplica percentual após ofertas e cupom e mantém frete fora da base', () => {
    const result = applyAuthorizedPosManualDiscount(quote(), {
      mode: 'PERCENTAGE',
      value: 1_000,
      reasonCode: 'COURTESY',
    });
    expect(result.manualDiscount).toBe(430);
    expect(result.discount).toBe(1_130);
    expect(result.total).toBe(4_170);
    expect(result.adjustments.at(-1)).toMatchObject({
      type: 'MANUAL_DISCOUNT',
      amount: 430,
    });
    expect(result.quoteFingerprint).not.toBe('a'.repeat(64));
  });

  it('arredonda percentual uma vez para centavos', () => {
    const result = applyAuthorizedPosManualDiscount(
      quote({
        subtotal: 333,
        automaticDiscount: 0,
        couponDiscount: 0,
        discount: 0,
        deliveryFee: 0,
        total: 333,
        adjustments: [],
        coupon: null,
        couponId: null,
      }),
      { mode: 'PERCENTAGE', value: 3_333, reasonCode: 'NEGOTIATED' },
    );
    expect(result.manualDiscount).toBe(111);
    expect(result.total).toBe(222);
  });

  it('bloqueia desconto acima da base elegível', () => {
    expect(() =>
      applyAuthorizedPosManualDiscount(quote(), {
        mode: 'FIXED',
        value: 4_301,
        reasonCode: 'SERVICE_RECOVERY',
      }),
    ).toThrow('não pode exceder');
  });
});
