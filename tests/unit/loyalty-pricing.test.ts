import { describe, expect, it } from 'vitest';

import { loyaltyProgramInputSchema } from '@/schemas/loyalty';
import {
  applyAuthorizedLoyaltyReward,
  evaluateAuthorizedLoyaltyRewards,
  type ResolvedCheckoutQuote,
} from '@/server/services/checkout-quote.service';

const createdAt = new Date('2026-08-01T12:00:00.000Z');

function reward(
  overrides: Partial<Parameters<typeof evaluateAuthorizedLoyaltyRewards>[1][number]> = {},
) {
  return {
    id: 'reward-a',
    rewardType: 'FIXED_DISCOUNT' as const,
    value: 1_000,
    percentageBasisPoints: null,
    maximumDiscountValue: null,
    freeProductId: null,
    freeProductNameSnapshot: null,
    freeProductBaseValue: null,
    minimumOrderValue: 3_000,
    expiresAt: null,
    createdAt,
    ...overrides,
  };
}

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
    ).toThrow('Remova o cupom');
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

describe('Fidelidade V2', () => {
  it('calcula percentual sobre os itens após promoções e respeita o teto', () => {
    const baseQuote = quote({
      subtotal: 10_000,
      automaticDiscount: 1_000,
      discount: 1_000,
      total: 9_500,
      adjustments: [
        {
          type: 'PRODUCT_PROMOTION',
          sourceId: 'promotion-a',
          sourceVersion: 1,
          label: 'Promoção',
          amount: 1_000,
        },
      ],
    });
    const percentageReward = reward({
      rewardType: 'PERCENT_DISCOUNT',
      value: null,
      percentageBasisPoints: 1_500,
      maximumDiscountValue: 1_000,
    });

    const result = applyAuthorizedLoyaltyReward(baseQuote, percentageReward);

    expect(result.loyaltyDiscount).toBe(1_000);
    expect(result.total).toBe(8_500);
  });

  it('usa centavos inteiros sem arredondar o percentual para cima', () => {
    const result = applyAuthorizedLoyaltyReward(
      quote({ subtotal: 3_333, total: 3_833 }),
      reward({
        rewardType: 'PERCENT_DISCOUNT',
        value: null,
        percentageBasisPoints: 1_500,
        minimumOrderValue: 0,
      }),
    );

    expect(result.loyaltyDiscount).toBe(499);
  });

  it('cobre uma única unidade base e mantém adicionais pagos', () => {
    const result = applyAuthorizedLoyaltyReward(
      quote({
        subtotal: 3_000,
        total: 3_500,
        lines: [
          {
            lineId: 'line-a',
            productId: 'fries-a',
            productName: 'Batata pequena',
            imageUrl: null,
            imageAssetId: null,
            quantity: 2,
            notes: '',
            options: [
              {
                id: 'cheddar-a',
                name: 'Cheddar',
                price: 300,
                position: 0,
                groupId: 'extras-a',
                groupName: 'Adicionais',
                groupPosition: 0,
              },
            ],
            unitPrice: 1_500,
            itemTotal: 3_000,
          },
        ],
      }),
      reward({
        rewardType: 'FREE_PRODUCT',
        value: null,
        freeProductId: 'fries-a',
        freeProductNameSnapshot: 'Batata pequena',
        freeProductBaseValue: 1_200,
        minimumOrderValue: 0,
      }),
    );

    expect(result.loyaltyDiscount).toBe(1_200);
    expect(result.total).toBe(2_300);
    expect(result.adjustments.at(-1)).toMatchObject({ lineId: 'line-a', amount: 1_200 });
  });

  it('usa o valor efetivo médio após promoção no produto grátis', () => {
    const result = applyAuthorizedLoyaltyReward(
      quote({
        subtotal: 2_400,
        automaticDiscount: 400,
        discount: 400,
        total: 2_500,
        lines: [
          {
            lineId: 'line-a',
            productId: 'fries-a',
            productName: 'Batata pequena',
            imageUrl: null,
            imageAssetId: null,
            quantity: 2,
            notes: '',
            options: [],
            unitPrice: 1_200,
            itemTotal: 2_400,
          },
        ],
        adjustments: [
          {
            type: 'PRODUCT_PROMOTION',
            sourceId: 'promotion-a',
            sourceVersion: 1,
            label: 'Promoção da batata',
            amount: 400,
            lineId: 'line-a',
          },
        ],
      }),
      reward({
        rewardType: 'FREE_PRODUCT',
        value: null,
        freeProductId: 'fries-a',
        freeProductNameSnapshot: 'Batata pequena',
        freeProductBaseValue: 1_200,
        minimumOrderValue: 0,
      }),
    );

    expect(result.loyaltyDiscount).toBe(1_000);
    expect(result.total).toBe(1_500);
  });

  it('mantém produto esgotado inelegível sem consumir o benefício', () => {
    const evaluated = evaluateAuthorizedLoyaltyRewards(quote(), [
      reward({
        rewardType: 'FREE_PRODUCT',
        value: null,
        freeProductId: 'fries-a',
        freeProductNameSnapshot: 'Batata pequena',
        freeProductBaseValue: 1_200,
        freeProductState: 'SOLD_OUT',
      }),
    ]);

    expect(evaluated.options[0]).toMatchObject({ eligible: false, savings: 0 });
    expect(evaluated.options[0]?.reason).toContain('acabou');
  });

  it('recomenda maior economia e desempata por validade, antiguidade e id', () => {
    const result = evaluateAuthorizedLoyaltyRewards(
      quote(),
      [
        reward({ id: 'reward-c', expiresAt: new Date('2026-09-10T00:00:00.000Z') }),
        reward({ id: 'reward-b', expiresAt: new Date('2026-09-01T00:00:00.000Z') }),
        reward({
          id: 'reward-a',
          expiresAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
        }),
      ],
      new Date('2026-08-28T00:00:00.000Z'),
    );

    expect(result.recommendedId).toBe('reward-a');
    expect(result.options).toHaveLength(3);
  });

  it('rejeita benefício expirado usando o horário recebido do servidor', () => {
    expect(() =>
      applyAuthorizedLoyaltyReward(
        quote(),
        reward({ expiresAt: new Date('2026-08-27T23:59:59.000Z') }),
        new Date('2026-08-28T00:00:00.000Z'),
      ),
    ).toThrow('expirou');
  });
});
