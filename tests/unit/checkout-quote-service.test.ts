import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutQuoteInput } from '@/schemas/checkout';
import { calculateCheckoutQuote } from '@/server/services/checkout-quote.service';

const mocks = vi.hoisted(() => ({
  getEffectiveStoreAvailabilityForTenant: vi.fn(),
}));

vi.mock('@/server/services/store-availability.service', () => ({
  getEffectiveStoreAvailabilityForTenant: mocks.getEffectiveStoreAvailabilityForTenant,
}));

const now = new Date('2026-07-27T12:00:00.000Z');
const productId = '10000000-0000-4000-8000-000000000001';

function input(overrides: Partial<CheckoutQuoteInput> = {}): CheckoutQuoteInput {
  return {
    modality: 'PICKUP',
    items: [
      {
        lineId: '20000000-0000-4000-8000-000000000001',
        productId,
        quantity: 2,
        notes: '',
        optionIds: [],
      },
    ],
    ...overrides,
  };
}

function createClient() {
  const store = {
    findUnique: vi.fn().mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      slug: 'loja-a',
      settings: {
        minOrderValue: 0,
        estimatedTimeMinMinutes: 30,
        estimatedTimeMaxMinutes: 50,
        deliveryEnabled: true,
        pickupEnabled: true,
      },
    }),
  };
  const product = {
    findMany: vi.fn().mockResolvedValue([
      {
        id: productId,
        name: 'X-Salada',
        basePrice: 2000,
        imageUrl: 'https://example.test/produto.jpg',
        imageAssetId: null,
        allowNotes: true,
        isAvailable: true,
        isSoldOut: false,
        archivedAt: null,
        category: { isActive: true, archivedAt: null },
        optionGroups: [],
      },
    ]),
  };
  const deliveryZone = { findMany: vi.fn().mockResolvedValue([]) };
  const coupon = { findFirst: vi.fn().mockResolvedValue(null) };
  return { store, product, deliveryZone, coupon };
}

describe('cotação autoritativa do checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: true,
      state: 'OPEN',
      reason: 'Aberta agora.',
      nextTransitionAt: null,
    });
  });

  it('é determinística para o mesmo estado e muda quando o preço muda', async () => {
    const client = createClient();

    const first = await calculateCheckoutQuote('loja-a', input(), {
      client: client as never,
      now,
    });
    const retry = await calculateCheckoutQuote('loja-a', input(), {
      client: client as never,
      now,
    });
    expect(retry?.quoteFingerprint).toBe(first?.quoteFingerprint);
    expect(first).toMatchObject({
      subtotal: 4000,
      discount: 0,
      deliveryFee: 0,
      total: 4000,
      canCheckout: true,
      promisedFulfillmentMinAt: '2026-07-27T12:30:00.000Z',
      promisedFulfillmentMaxAt: '2026-07-27T12:50:00.000Z',
    });

    client.product.findMany.mockResolvedValueOnce([
      {
        ...(await client.product.findMany.mock.results[0].value)[0],
        basePrice: 2500,
      },
    ]);
    const changed = await calculateCheckoutQuote('loja-a', input(), {
      client: client as never,
      now,
    });

    expect(changed?.total).toBe(5000);
    expect(changed?.quoteFingerprint).not.toBe(first?.quoteFingerprint);
  });

  it('resolve entrega por CEP e cupom somente dentro de tenant e loja', async () => {
    const client = createClient();
    client.deliveryZone.findMany.mockResolvedValue([
      {
        id: 'zone-a',
        name: 'Centro',
        fee: 600,
        minOrderValue: 3000,
        estimatedTime: '40–55 min',
      },
    ]);
    client.coupon.findFirst.mockResolvedValue({
      id: 'coupon-a',
      code: 'BEMVINDO10',
      type: 'PERCENTAGE',
      value: 10,
      minOrderValue: 3000,
      maxDiscount: null,
      maxUsages: 100,
      usageCount: 2,
      isActive: true,
      startsAt: null,
      expiresAt: null,
    });

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({
        modality: 'DELIVERY',
        deliveryPostalCode: '01001000',
        couponCode: 'BEMVINDO10',
      }),
      { client: client as never, now },
    );

    expect(client.deliveryZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          postalRanges: {
            some: {
              isActive: true,
              postalCodeStart: { lte: '01001000' },
              postalCodeEnd: { gte: '01001000' },
            },
          },
        }),
        take: 2,
      }),
    );
    expect(client.coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          storeId: 'store-a',
          code: 'BEMVINDO10',
        },
      }),
    );
    expect(quote).toMatchObject({
      deliveryZoneId: 'zone-a',
      deliveryFee: 600,
      discount: 400,
      total: 4200,
      coupon: { code: 'BEMVINDO10', discount: 400 },
      canCheckout: true,
      promisedFulfillmentMinAt: '2026-07-27T12:40:00.000Z',
      promisedFulfillmentMaxAt: '2026-07-27T12:55:00.000Z',
    });
  });

  it.each(['999999999999999999999999999999 min', '80-20 min', 'Na próxima hora'])(
    'usa prazo seguro quando o legado da zona é inválido: %s',
    async (estimatedTime) => {
      const client = createClient();
      client.store.findUnique.mockResolvedValueOnce({
        id: 'store-a',
        tenantId: 'tenant-a',
        slug: 'loja-a',
        settings: {
          minOrderValue: 0,
          estimatedTimeMinMinutes: Number.POSITIVE_INFINITY,
          estimatedTimeMaxMinutes: Number.MAX_SAFE_INTEGER,
          deliveryEnabled: true,
          pickupEnabled: true,
        },
      });
      client.deliveryZone.findMany.mockResolvedValue([
        {
          id: 'zone-a',
          name: 'Centro',
          fee: 600,
          minOrderValue: 0,
          estimatedTime,
        },
      ]);

      const quote = await calculateCheckoutQuote(
        'loja-a',
        input({
          modality: 'DELIVERY',
          deliveryPostalCode: '01001000',
        }),
        { client: client as never, now },
      );

      expect(quote).toMatchObject({
        estimatedMinMinutes: 30,
        estimatedMaxMinutes: 50,
        promisedFulfillmentMinAt: '2026-07-27T12:30:00.000Z',
        promisedFulfillmentMaxAt: '2026-07-27T12:50:00.000Z',
      });
      expect(Number.isNaN(Date.parse(quote!.promisedFulfillmentMinAt))).toBe(false);
      expect(Number.isNaN(Date.parse(quote!.promisedFulfillmentMaxAt))).toBe(false);
    },
  );

  it('não aceita zona fora da cobertura nem cupom inválido', async () => {
    const client = createClient();

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({
        modality: 'DELIVERY',
        deliveryPostalCode: '99999999',
        couponCode: 'EXPIRADO',
      }),
      { client: client as never, now },
    );

    expect(quote?.canCheckout).toBe(false);
    expect(quote?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OUTSIDE_DELIVERY_AREA' }),
        expect.objectContaining({ code: 'COUPON_INVALID' }),
      ]),
    );
  });

  it('rejeita linhas semanticamente duplicadas mesmo com lineId diferente', async () => {
    const client = createClient();
    const first = input().items[0];

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({
        items: [
          first,
          {
            ...first,
            lineId: '20000000-0000-4000-8000-000000000002',
            quantity: 1,
          },
        ],
      }),
      { client: client as never, now },
    );

    expect(quote?.lines).toHaveLength(1);
    expect(quote?.issues).toContainEqual(
      expect.objectContaining({
        code: 'CART_INVALID',
        lineId: '20000000-0000-4000-8000-000000000002',
      }),
    );
  });

  it('converte estouro monetário em erro público seguro do carrinho', async () => {
    const client = createClient();
    client.product.findMany.mockResolvedValueOnce([
      {
        id: productId,
        name: 'Produto fora do limite',
        basePrice: 2_147_483_647,
        imageUrl: null,
        imageAssetId: null,
        allowNotes: true,
        isAvailable: true,
        isSoldOut: false,
        archivedAt: null,
        category: { isActive: true, archivedAt: null },
        optionGroups: [],
      },
    ]);

    await expect(
      calculateCheckoutQuote('loja-a', input(), {
        client: client as never,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'CART_INVALID',
      statusCode: 422,
    });
  });
});
