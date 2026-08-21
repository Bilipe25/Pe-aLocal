import { describe, expect, it } from 'vitest';

import { canonicalOfferAdminInputSchema, comboAdminInputSchema } from '@/schemas/offers';

describe('schemas de ofertas', () => {
  it('aceita IDs GUID legados do catálogo ao criar combo e promoção', () => {
    const legacyProductIds = [
      '00000000-0000-0000-0002-000000000001',
      '00000000-0000-0000-0002-000000000005',
    ];
    const combo = comboAdminInputSchema.safeParse({
      name: 'Combo legado',
      description: '',
      specialPrice: 30,
      isActive: true,
      sortOrder: 0,
      startsOn: null,
      endsOnExclusive: null,
      startTime: null,
      endTimeExclusive: null,
      items: legacyProductIds.map((productId) => ({ productId, quantity: 1 })),
    });
    const promotion = canonicalOfferAdminInputSchema.safeParse({
      kind: 'PRODUCT_FIXED_PRICE',
      name: 'Preço especial legado',
      description: '',
      isActive: true,
      modalities: [],
      productId: legacyProductIds[0],
      fixedPrice: 10,
      maxApplicationsPerOrder: 99,
      startsOn: null,
      endsOnExclusive: null,
      startTime: null,
      endTimeExclusive: null,
    });

    expect(combo.success).toBe(true);
    expect(promotion.success).toBe(true);
  });

  it('limita a quantidade total de componentes de um combo', () => {
    const parsed = comboAdminInputSchema.safeParse({
      name: 'Combo excessivo',
      description: '',
      specialPrice: 10,
      isActive: true,
      sortOrder: 0,
      startsOn: null,
      endsOnExclusive: null,
      startTime: null,
      endTimeExclusive: null,
      items: [
        { productId: '10000000-0000-4000-8000-000000000001', quantity: 126 },
        { productId: '10000000-0000-4000-8000-000000000002', quantity: 125 },
      ],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['items'], message: expect.stringContaining('250') }),
      ]),
    );
  });

  it('valida os campos exigidos por cada intenção canônica', () => {
    const common = {
      name: 'Leve três',
      description: '',
      isActive: true,
      modalities: ['PICKUP'],
      maxApplicationsPerOrder: 2,
      startsOn: null,
      endsOnExclusive: null,
      startTime: null,
      endTimeExclusive: null,
    };
    expect(
      canonicalOfferAdminInputSchema.safeParse({
        ...common,
        kind: 'QUANTITY_FIXED_PRICE',
        productId: '10000000-0000-4000-8000-000000000001',
        requiredQuantity: 3,
        fixedPrice: 45,
      }).success,
    ).toBe(true);
    const invalid = canonicalOfferAdminInputSchema.safeParse({
      ...common,
      kind: 'BOGO',
      productId: null,
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['productId', 'buyQuantity']),
    );
  });

  it('valida grupos e converte adicionais de combo flexível para centavos', () => {
    const parsed = canonicalOfferAdminInputSchema.safeParse({
      kind: 'COMBO_FLEXIBLE',
      name: 'Monte seu combo',
      description: '',
      isActive: true,
      modalities: [],
      fixedPrice: 39.9,
      maxApplicationsPerOrder: 99,
      startsOn: null,
      endsOnExclusive: null,
      startTime: null,
      endTimeExclusive: null,
      groups: [
        {
          name: 'Lanche',
          quantity: 1,
          choices: [{ productId: '10000000-0000-4000-8000-000000000001', priceDelta: 3 }],
        },
        {
          name: 'Bebida',
          quantity: 1,
          choices: [{ productId: '10000000-0000-4000-8000-000000000002', priceDelta: 0 }],
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.fixedPrice).toBe(3990);
    expect(parsed.data.groups?.[0]?.choices[0]?.priceDelta).toBe(300);
  });
});
