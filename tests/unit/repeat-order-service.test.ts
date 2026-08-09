import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storefrontDeviceFindUnique: vi.fn(),
  orderFindFirst: vi.fn(),
  productFindMany: vi.fn(),
  hashStorefrontDeviceToken: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    storefrontDevice: { findUnique: mocks.storefrontDeviceFindUnique },
    order: { findFirst: mocks.orderFindFirst },
    product: { findMany: mocks.productFindMany },
  }),
}));
vi.mock('@/server/services/customer-device-recognition.service', () => ({
  hashStorefrontDeviceToken: mocks.hashStorefrontDeviceToken,
  isStorefrontDeviceToken: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
}));
vi.mock('@/features/assets/urls', () => ({
  storeAssetUrl: (assetId: string, width: number) => `/api/assets/${assetId}?width=${width}`,
}));

import { prepareOrderRepeat } from '@/server/services/repeat-order.service';

const now = new Date('2026-08-08T12:00:00.000Z');
const productId = '00000000-0000-0000-0002-000000000001';
const optionId = '00000000-0000-0000-0003-000000000001';

function historicOrder(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        productId,
        productName: 'X-Burguer antigo',
        unitPrice: 2_500,
        quantity: 2,
        notes: 'Sem cebola',
        options: [{ optionId }],
        ...overrides,
      },
    ],
  };
}

function currentProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    name: 'X-Burguer atual',
    basePrice: 3_000,
    allowNotes: true,
    imageUrl: null,
    imageAssetId: 'asset-current',
    optionGroups: [
      {
        id: 'group-a',
        title: 'Adicionais',
        isRequired: false,
        minSelections: 0,
        maxSelections: 2,
        options: [{ id: optionId, name: 'Bacon atual', price: 500 }],
      },
    ],
    ...overrides,
  };
}

describe('repetição autoritativa de pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashStorefrontDeviceToken.mockResolvedValue('a'.repeat(64));
    mocks.storefrontDeviceFindUnique.mockResolvedValue({
      expiresAt: new Date('2026-11-01T00:00:00.000Z'),
      recognitions: [{ customerId: 'customer-a' }],
    });
    mocks.orderFindFirst.mockResolvedValue(historicOrder());
    mocks.productFindMany.mockResolvedValue([currentProduct()]);
  });

  it('recalcula nomes, opções e preços com o catálogo atual', async () => {
    const result = await prepareOrderRepeat({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
      now,
    });

    expect(result).toEqual({
      readyItems: [
        expect.objectContaining({
          productId,
          productName: 'X-Burguer atual',
          basePrice: 3_000,
          unitPrice: 3_500,
          quantity: 2,
          selectedOptions: [{ id: optionId, name: 'Bacon atual', price: 500 }],
          imageUrl: '/api/assets/asset-current?width=384',
          priceChanged: true,
        }),
      ],
      issues: [],
    });
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          publicToken: '4da03571-bffd-45ef-8c44-20686c487838',
          publicTokenExpiresAt: { gt: now },
        }),
      }),
    );
    expect(mocks.productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          id: { in: [productId] },
        }),
      }),
    );
  });

  it('não adiciona produto removido ou indisponível', async () => {
    mocks.productFindMany.mockResolvedValue([]);

    await expect(
      prepareOrderRepeat({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
        now,
      }),
    ).resolves.toEqual({
      readyItems: [],
      issues: [expect.objectContaining({ productId, reason: 'UNAVAILABLE' })],
    });
  });

  it('exige revisão quando uma opção histórica não existe mais', async () => {
    mocks.productFindMany.mockResolvedValue([
      currentProduct({ optionGroups: [{ ...currentProduct().optionGroups[0], options: [] }] }),
    ]);

    await expect(
      prepareOrderRepeat({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
        now,
      }),
    ).resolves.toEqual({
      readyItems: [],
      issues: [expect.objectContaining({ productId, reason: 'REVIEW_REQUIRED' })],
    });
  });

  it('só aceita orderId quando o aparelho reconhece o consumidor da loja', async () => {
    const deviceToken = 'd'.repeat(43);
    await prepareOrderRepeat({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
      deviceToken,
      now,
    });

    expect(mocks.storefrontDeviceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          recognitions: expect.objectContaining({
            where: expect.objectContaining({
              tenantId: 'tenant-a',
              storeId: 'store-a',
              revokedAt: null,
              customer: { tenantId: 'tenant-a', recognitionEnabled: true },
            }),
          }),
        }),
      }),
    );
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'order-a', customerId: 'customer-a' }),
      }),
    );
  });

  it('rejeita aparelho expirado antes de consultar o pedido', async () => {
    mocks.storefrontDeviceFindUnique.mockResolvedValue({
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      recognitions: [{ customerId: 'customer-a' }],
    });

    await expect(
      prepareOrderRepeat({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
        deviceToken: 'd'.repeat(43),
        now,
      }),
    ).resolves.toBeNull();
    expect(mocks.orderFindFirst).not.toHaveBeenCalled();
  });
});
