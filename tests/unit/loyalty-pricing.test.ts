import { describe, expect, it } from 'vitest';

import { loyaltyProgramInputSchema } from '@/schemas/loyalty';
import {
  applyAuthorizedLoyaltyReward,
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
    adjustments: [],
    subtotal: 3_500,
    automaticDiscount: 0,
    couponDiscount: 0,
    manualDiscount: 0,
    loyaltyDiscount: 0,
    discount: 0,
    deliveryFee: 500,
    total: 4_000,
    minOrderValue: 0,
    missingForMinimum: 0,
    deliveryZoneId: null,
    deliveryZoneName: null,
    promisedFulfillmentMinAt: new Date(0).toISOString(),
    promisedFulfillmentMaxAt: new Date(0).toISOString(),
    coupon: null,
    couponId: null,
    issues: [],
    canCheckout: true,
    estimatedMinMinutes: 30,
    estimatedMaxMinutes: 50,
    ...overrides,
  };
}

describe('Fidelidade V1', () => {
  it('valida limites simples da configuração', () => {
    expect(
      loyaltyProgramInputSchema.safeParse({
        requiredOrders: 1,
        rewardValue: 1_000,
        minimumOrderValue: 3_000,
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      loyaltyProgramInputSchema.safeParse({
        requiredOrders: 5,
        rewardValue: 1_000,
        minimumOrderValue: 3_000,
        isActive: true,
      }).success,
    ).toBe(true);
  });

  it('aplica só sobre itens e mantém o frete fora do benefício', () => {
    const result = applyAuthorizedLoyaltyReward(quote(), {
      id: 'reward-a',
      value: 1_000,
      minimumOrderValue: 3_000,
    });
    expect(result.loyaltyDiscount).toBe(1_000);
    expect(result.total).toBe(3_000);
    expect(result.adjustments.at(-1)).toMatchObject({ type: 'LOYALTY', amount: 1_000 });
  });

  it('não acumula fidelidade com cupom', () => {
    expect(() =>
      applyAuthorizedLoyaltyReward(
        quote({
          couponDiscount: 500,
          discount: 500,
          total: 3_500,
          coupon: { code: 'VOLTE', discount: 500 },
          couponId: 'coupon-a',
          adjustments: [
            {
              type: 'COUPON',
              sourceId: 'coupon-a',
              sourceVersion: null,
              label: 'Cupom VOLTE',
              amount: 500,
            },
          ],
        }),
        { id: 'reward-a', value: 1_000, minimumOrderValue: 3_000 },
      ),
    ).toThrow('não acumulam');
  });

  it('avalia o pedido mínimo antes do benefício', () => {
    expect(() =>
      applyAuthorizedLoyaltyReward(quote({ subtotal: 2_999, total: 3_499 }), {
        id: 'reward-a',
        value: 1_000,
        minimumOrderValue: 3_000,
      }),
    ).toThrow('a partir');
  });
});
