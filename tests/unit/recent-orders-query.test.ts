import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  storefrontDeviceFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
  productFindMany: vi.fn(),
  hashStorefrontDeviceToken: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    storefrontDevice: { findUnique: mocks.storefrontDeviceFindUnique },
    order: { findMany: mocks.orderFindMany },
    product: { findMany: mocks.productFindMany },
  }),
}));
vi.mock('@/server/services/customer-device-recognition.service', () => ({
  getStorefrontDeviceCookieName: () => 'pedidolocal_device',
  hashStorefrontDeviceToken: mocks.hashStorefrontDeviceToken,
  isStorefrontDeviceToken: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
}));
vi.mock('@/features/assets/urls', () => ({
  storeAssetUrl: (assetId: string, width: number) => `/api/assets/${assetId}?width=${width}`,
}));

import { getRecentOrdersForCurrentDevice } from '@/server/queries/recent-orders';

const productId = '00000000-0000-0000-0002-000000000001';

function order(id: string, orderNumber: number, createdAt: string) {
  return {
    id,
    orderNumber,
    createdAt: new Date(createdAt),
    total: 2_500,
    items: [
      {
        id: `item-${id}`,
        productId,
        productName: 'X-Burguer do pedido',
        unitPrice: 2_500,
        quantity: 1,
        notes: null,
        itemTotal: 2_500,
        imageUrl: null,
        imageAssetId: null,
        options: [],
      },
    ],
  };
}

describe('pedidos recentes do aparelho reconhecido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: 'd'.repeat(43) });
    mocks.hashStorefrontDeviceToken.mockResolvedValue('a'.repeat(64));
    mocks.storefrontDeviceFindUnique.mockResolvedValue({
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      recognitions: [{ customerId: 'customer-a' }],
    });
    mocks.orderFindMany.mockResolvedValue([
      order('order-b', 102, '2026-08-07T12:00:00.000Z'),
      order('order-a', 101, '2026-08-06T12:00:00.000Z'),
    ]);
    mocks.productFindMany.mockResolvedValue([
      { id: productId, imageUrl: null, imageAssetId: 'asset-current' },
    ]);
  });

  it('mantém pedidos iguais como unidades históricas distintas', async () => {
    const result = await getRecentOrdersForCurrentDevice({
      tenantId: 'tenant-a',
      storeId: 'store-a',
    });

    expect(result.map((item) => item.id)).toEqual(['order-b', 'order-a']);
    expect(result.map((item) => item.orderNumber)).toEqual([102, 101]);
  });

  it('restringe reconhecimento, pedidos e miniaturas à loja ativa', async () => {
    await getRecentOrdersForCurrentDevice({ tenantId: 'tenant-a', storeId: 'store-a' });

    expect(mocks.storefrontDeviceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          recognitions: expect.objectContaining({
            where: expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
          }),
        }),
      }),
    );
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          customerId: 'customer-a',
        }),
        take: 20,
      }),
    );
    expect(mocks.productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', storeId: 'store-a', id: { in: [productId] } },
      }),
    );
  });

  it('não consulta pedidos sem cookie válido', async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(
      getRecentOrdersForCurrentDevice({ tenantId: 'tenant-a', storeId: 'store-a' }),
    ).resolves.toEqual([]);
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });

  it('prioriza a imagem persistida no pedido sem consultar o catálogo atual', async () => {
    mocks.orderFindMany.mockResolvedValue([
      {
        ...order('order-a', 101, '2026-08-06T12:00:00.000Z'),
        items: [
          {
            ...order('order-a', 101, '2026-08-06T12:00:00.000Z').items[0],
            imageUrl: '/snapshot.webp',
            imageAssetId: 'asset-snapshot',
          },
        ],
      },
    ]);

    const result = await getRecentOrdersForCurrentDevice({
      tenantId: 'tenant-a',
      storeId: 'store-a',
    });

    expect(mocks.productFindMany).not.toHaveBeenCalled();
    expect(result[0]?.items[0]).toMatchObject({
      imageUrl: '/api/assets/asset-snapshot?width=384',
      imageAssetId: 'asset-snapshot',
    });
  });
});
