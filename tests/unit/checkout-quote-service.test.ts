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

function firstProductItem(value = input()) {
  const item = value.items[0];
  if (!item || item.kind === 'COMBO') throw new Error('Produto de teste ausente.');
  return item;
}

function createClient() {
  const store = {
    findUnique: vi.fn().mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      slug: 'loja-a',
      timeZone: 'America/Fortaleza',
      entitlement: { dineInQrEnabled: false, combosPromotionsEnabled: false },
      address: { city: 'São Paulo', state: 'SP' },
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
  const deliveryZone = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const deliveryZonePostalRange = { count: vi.fn().mockResolvedValue(0) };
  const coupon = { findFirst: vi.fn().mockResolvedValue(null) };
  const storeCombo = { findMany: vi.fn().mockResolvedValue([]) };
  const storeProductPromotion = { findMany: vi.fn().mockResolvedValue([]) };
  return {
    store,
    product,
    storeCombo,
    storeProductPromotion,
    deliveryZone,
    deliveryZonePostalRange,
    coupon,
  };
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

  it('aplica promoção antes do cupom e preserva os ajustes separados', async () => {
    const client = createClient();
    client.store.findUnique.mockResolvedValueOnce({
      ...(await client.store.findUnique()),
      entitlement: { dineInQrEnabled: false, combosPromotionsEnabled: true },
    });
    client.storeProductPromotion.findMany.mockResolvedValueOnce([
      {
        id: '50000000-0000-4000-8000-000000000001',
        productId,
        promotionalPrice: 1500,
        version: 4,
        startsOn: null,
        endsOnExclusive: null,
        weekdays: [],
        startMinute: null,
        endMinuteExclusive: null,
      },
    ]);
    client.coupon.findFirst.mockResolvedValueOnce({
      id: '60000000-0000-4000-8000-000000000001',
      code: 'MENOS10',
      type: 'PERCENTAGE',
      value: 10,
      minOrderValue: 3000,
      maxDiscount: null,
      maxUsages: null,
      usageCount: 0,
      isActive: true,
      startsAt: null,
      expiresAt: null,
      _count: { reservations: 0 },
    });

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({ couponCode: 'MENOS10' }),
      { client: client as never, now },
    );

    expect(quote).toMatchObject({
      subtotal: 4000,
      automaticDiscount: 1000,
      couponDiscount: 300,
      discount: 1300,
      total: 2700,
      coupon: { code: 'MENOS10', discount: 300 },
    });
    expect((quote?.adjustments ?? []).map((adjustment) => adjustment.type)).toEqual([
      'PRODUCT_PROMOTION',
      'COUPON',
    ]);
  });

  it('resolve componentes reais do combo, cobra adicionais e inclui a versão no fingerprint', async () => {
    const client = createClient();
    const secondProductId = '10000000-0000-4000-8000-000000000002';
    const comboId = '70000000-0000-4000-8000-000000000001';
    const comboItemA = '71000000-0000-4000-8000-000000000001';
    const comboItemB = '71000000-0000-4000-8000-000000000002';
    const optionId = '72000000-0000-4000-8000-000000000001';
    const baseStore = await client.store.findUnique();
    client.store.findUnique.mockResolvedValue({
      ...baseStore,
      entitlement: { dineInQrEnabled: false, combosPromotionsEnabled: true },
    });
    const combo = {
      id: comboId,
      name: 'Combo da Casa',
      specialPrice: 2500,
      isActive: true,
      version: 2,
      startsOn: null,
      endsOnExclusive: null,
      weekdays: [],
      startMinute: null,
      endMinuteExclusive: null,
      items: [
        { id: comboItemA, productId, quantity: 1, position: 0 },
        { id: comboItemB, productId: secondProductId, quantity: 1, position: 1 },
      ],
    };
    client.storeCombo.findMany.mockResolvedValue([combo]);
    const firstProduct = (await client.product.findMany())[0];
    client.product.findMany.mockResolvedValue([
      {
        ...firstProduct,
        optionGroups: [
          {
            id: '73000000-0000-4000-8000-000000000001',
            title: 'Adicionais',
            sortOrder: 0,
            isRequired: false,
            isMultiple: true,
            minSelections: 0,
            maxSelections: 2,
            isActive: true,
            archivedAt: null,
            options: [
              {
                id: optionId,
                name: 'Bacon',
                price: 300,
                sortOrder: 0,
                isAvailable: true,
                archivedAt: null,
              },
            ],
          },
        ],
      },
      {
        ...firstProduct,
        id: secondProductId,
        name: 'Batata',
        basePrice: 1000,
        optionGroups: [],
      },
    ]);
    const comboInput = input({
      items: [
        {
          kind: 'COMBO',
          lineId: '74000000-0000-4000-8000-000000000001',
          comboId,
          quantity: 1,
          components: [
            { comboItemId: comboItemA, notes: '', optionIds: [optionId] },
            { comboItemId: comboItemB, notes: '', optionIds: [] },
          ],
        },
      ],
    });

    const first = await calculateCheckoutQuote('loja-a', comboInput, {
      client: client as never,
      now,
    });
    expect(first).toMatchObject({
      subtotal: 3300,
      automaticDiscount: 500,
      discount: 500,
      total: 2800,
      offerGroups: [
        {
          comboId,
          comboVersion: 2,
          regularBaseAmount: 3000,
          offerBaseAmount: 2500,
          discountAmount: 500,
        },
      ],
    });
    client.storeCombo.findMany.mockResolvedValueOnce([{ ...combo, version: 3 }]);
    const changed = await calculateCheckoutQuote('loja-a', comboInput, {
      client: client as never,
      now,
    });
    expect(changed?.quoteFingerprint).not.toBe(first?.quoteFingerprint);
  });

  it('preserva grupo e ordem comercial das opções no snapshot da cotação', async () => {
    const client = createClient();
    const groupA = '30000000-0000-4000-8000-000000000001';
    const groupB = '30000000-0000-4000-8000-000000000002';
    const optionA1 = '40000000-0000-4000-8000-000000000001';
    const optionA2 = '40000000-0000-4000-8000-000000000002';
    const optionB = '40000000-0000-4000-8000-000000000003';
    client.product.findMany.mockResolvedValueOnce([
      {
        id: productId,
        name: 'X-Salada',
        basePrice: 2000,
        imageUrl: null,
        imageAssetId: null,
        allowNotes: true,
        isAvailable: true,
        isSoldOut: false,
        archivedAt: null,
        category: { isActive: true, archivedAt: null },
        optionGroups: [
          {
            id: groupB,
            title: 'Bebida',
            sortOrder: 20,
            isRequired: false,
            isMultiple: false,
            minSelections: 0,
            maxSelections: 1,
            isActive: true,
            archivedAt: null,
            options: [
              {
                id: optionB,
                name: 'Refrigerante',
                price: 500,
                sortOrder: 0,
                isAvailable: true,
                archivedAt: null,
              },
            ],
          },
          {
            id: groupA,
            title: 'Adicionais',
            sortOrder: 10,
            isRequired: false,
            isMultiple: true,
            minSelections: 0,
            maxSelections: 2,
            isActive: true,
            archivedAt: null,
            options: [
              {
                id: optionA2,
                name: 'Ovo',
                price: 200,
                sortOrder: 20,
                isAvailable: true,
                archivedAt: null,
              },
              {
                id: optionA1,
                name: 'Bacon',
                price: 300,
                sortOrder: 10,
                isAvailable: true,
                archivedAt: null,
              },
            ],
          },
        ],
      },
    ]);

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({
        items: [{ ...firstProductItem(), quantity: 1, optionIds: [optionB, optionA2, optionA1] }],
      }),
      { client: client as never, now },
    );

    expect(quote?.lines[0]?.options).toEqual([
      {
        id: optionA1,
        name: 'Bacon',
        price: 300,
        position: 0,
        groupId: groupA,
        groupName: 'Adicionais',
        groupPosition: 10,
      },
      {
        id: optionA2,
        name: 'Ovo',
        price: 200,
        position: 1,
        groupId: groupA,
        groupName: 'Adicionais',
        groupPosition: 10,
      },
      {
        id: optionB,
        name: 'Refrigerante',
        price: 500,
        position: 2,
        groupId: groupB,
        groupName: 'Bebida',
        groupPosition: 20,
      },
    ]);
    expect(client.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          optionGroups: expect.objectContaining({
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          }),
        }),
      }),
    );
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
      _count: { reservations: 0 },
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
        address: { city: 'São Paulo', state: 'SP' },
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

  it('aceita zona ativa sem CEP e calcula taxa sem confiar em dados livres do cliente', async () => {
    const client = createClient();
    client.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-a',
      name: 'Centro',
      fee: 600,
      minOrderValue: 0,
      estimatedTime: '40-55 min',
    });

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({ modality: 'DELIVERY', deliveryZoneId: 'zone-a' }),
      { client: client as never, now },
    );

    expect(client.deliveryZone.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'zone-a',
          tenantId: 'tenant-a',
          storeId: 'store-a',
          isActive: true,
        }),
      }),
    );
    expect(client.deliveryZonePostalRange.count).not.toHaveBeenCalled();
    expect(quote).toMatchObject({
      deliveryZoneId: 'zone-a',
      deliveryZoneName: 'Centro',
      deliveryFee: 600,
      canCheckout: true,
    });
  });

  it('normaliza o CEP legado do endereço salvo e vincula a versão ao fingerprint', async () => {
    const client = createClient();
    client.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-a',
      name: 'Centro',
      fee: 600,
      minOrderValue: 0,
      estimatedTime: '40-55 min',
    });
    client.deliveryZonePostalRange.count.mockResolvedValue(1);
    const savedAddress = {
      id: 'address-a',
      addressFingerprint: 'f'.repeat(64),
      updatedAt: new Date('2026-07-20T12:00:00.000Z'),
      street: 'Rua das Flores',
      number: '10',
      complement: null,
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
      reference: null,
      mappedDeliveryZoneId: 'zone-a',
    };

    const first = await calculateCheckoutQuote(
      'loja-a',
      input({ modality: 'DELIVERY', savedAddressReference: 'a'.repeat(43) }),
      { client: client as never, now, savedAddress },
    );
    const changed = await calculateCheckoutQuote(
      'loja-a',
      input({ modality: 'DELIVERY', savedAddressReference: 'a'.repeat(43) }),
      {
        client: client as never,
        now,
        savedAddress: { ...savedAddress, updatedAt: new Date('2026-07-21T12:00:00.000Z') },
      },
    );

    expect(client.deliveryZonePostalRange.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deliveryZoneId: 'zone-a',
        postalCodeStart: { lte: '01001000' },
        postalCodeEnd: { gte: '01001000' },
      }),
    });
    expect(first?.canCheckout).toBe(true);
    expect(changed?.quoteFingerprint).not.toBe(first?.quoteFingerprint);
  });

  it('não permite trocar a zona autoritativa de um endereço salvo', async () => {
    const client = createClient();
    client.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-mapped',
      name: 'Centro',
      fee: 600,
      minOrderValue: 0,
      estimatedTime: '40-55 min',
    });
    client.deliveryZonePostalRange.count.mockResolvedValue(1);

    const quote = await calculateCheckoutQuote(
      'loja-a',
      input({
        modality: 'DELIVERY',
        deliveryZoneId: 'zone-cheap',
        savedAddressReference: 'a'.repeat(43),
      }),
      {
        client: client as never,
        now,
        savedAddress: {
          id: 'address-a',
          addressFingerprint: 'f'.repeat(64),
          updatedAt: new Date('2026-07-20T12:00:00.000Z'),
          street: 'Rua das Flores',
          number: '10',
          complement: null,
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01001000',
          reference: null,
          mappedDeliveryZoneId: 'zone-mapped',
        },
      },
    );

    expect(client.deliveryZone.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'zone-mapped' }) }),
    );
    expect(quote?.issues).toContainEqual(
      expect.objectContaining({ code: 'SAVED_ADDRESS_UNAVAILABLE' }),
    );
    expect(quote?.canCheckout).toBe(false);
  });

  it('valida o CEP aninhado do endereço manual contra a zona escolhida', async () => {
    const client = createClient();
    client.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-a',
      name: 'Centro',
      fee: 600,
      minOrderValue: 0,
      estimatedTime: '40-55 min',
    });
    client.deliveryZonePostalRange.count.mockResolvedValue(0);

    const quote = await calculateCheckoutQuote(
      'loja-a',
      {
        ...input({ modality: 'DELIVERY', deliveryZoneId: 'zone-a' }),
        deliveryAddress: {
          street: 'Rua Nova',
          number: '25',
          complement: '',
          reference: '',
          postalCode: '99999999',
        },
      },
      { client: client as never, now },
    );

    expect(client.deliveryZonePostalRange.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        deliveryZoneId: 'zone-a',
        postalCodeStart: { lte: '99999999' },
        postalCodeEnd: { gte: '99999999' },
      }),
    });
    expect(quote?.issues).toContainEqual(
      expect.objectContaining({ code: 'OUTSIDE_DELIVERY_AREA' }),
    );
    expect(quote?.canCheckout).toBe(false);
  });

  it('rejeita linhas semanticamente duplicadas mesmo com lineId diferente', async () => {
    const client = createClient();
    const first = firstProductItem();

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
