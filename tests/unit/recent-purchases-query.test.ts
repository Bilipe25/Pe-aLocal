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

import { getRecentPurchasedProductsForCurrentDevice } from '@/server/queries/recent-purchases';

const deviceToken = 'd'.repeat(43);

function currentProduct() {
  return {
    id: '00000000-0000-0000-0002-000000000001',
    name: 'X-Bacon atual',
    description: 'Descrição pública atual',
    imageUrl: 'https://cdn.example/x-bacon.jpg',
    imageAssetId: null,
    basePrice: 3_290,
    isAvailable: true,
    isFeatured: true,
    isSoldOut: false,
    sortOrder: 1,
    category: {
      id: '00000000-0000-0000-0001-000000000001',
      name: 'Lanches',
      sortOrder: 0,
    },
    optionGroups: [],
  };
}

describe('consulta privada de produtos comprados recentemente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieGet.mockReturnValue({ value: deviceToken });
    mocks.hashStorefrontDeviceToken.mockResolvedValue('a'.repeat(64));
    mocks.storefrontDeviceFindUnique.mockResolvedValue({
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      recognitions: [{ customerId: 'customer-a' }],
    });
    mocks.orderFindMany.mockResolvedValue([
      {
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
        deliveredAt: new Date('2026-07-28T13:00:00.000Z'),
        items: [{ productId: '00000000-0000-0000-0002-000000000001' }],
      },
    ]);
    mocks.productFindMany.mockResolvedValue([currentProduct()]);
  });

  it('não consulta banco quando o aparelho não possui cookie válido', async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(
      getRecentPurchasedProductsForCurrentDevice({
        tenantId: 'tenant-a',
        storeId: 'store-a',
      }),
    ).resolves.toEqual([]);

    expect(mocks.storefrontDeviceFindUnique).not.toHaveBeenCalled();
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });

  it('não lê cookie nem consulta reconhecimento quando a vitrine está desligada', async () => {
    await expect(
      getRecentPurchasedProductsForCurrentDevice({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        enabled: false,
      }),
    ).resolves.toEqual([]);

    expect(mocks.cookieGet).not.toHaveBeenCalled();
    expect(mocks.storefrontDeviceFindUnique).not.toHaveBeenCalled();
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });

  it('restringe dispositivo, reconhecimento, pedidos e catálogo ao tenant e à loja', async () => {
    const result = await getRecentPurchasedProductsForCurrentDevice({
      tenantId: 'tenant-a',
      storeId: 'store-a',
    });

    expect(mocks.storefrontDeviceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: 'a'.repeat(64) },
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
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          customerId: 'customer-a',
          status: {
            in: ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
          },
          OR: [
            { payment: { is: null } },
            {
              payment: {
                is: { status: { notIn: ['FAILED', 'CANCELLED', 'REFUNDED'] } },
              },
            },
          ],
        }),
        take: 20,
        select: {
          createdAt: true,
          deliveredAt: true,
          items: { select: { productId: true } },
        },
      }),
    );
    expect(mocks.productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          archivedAt: null,
          isAvailable: true,
          isSoldOut: false,
          basePrice: { gt: 0 },
          category: expect.objectContaining({
            tenantId: 'tenant-a',
            storeId: 'store-a',
            archivedAt: null,
            isActive: true,
          }),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: '00000000-0000-0000-0002-000000000001',
        name: 'X-Bacon atual',
        basePrice: 3_290,
        imageUrl: 'https://cdn.example/x-bacon.jpg',
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /customer-a|tenant-a|store-a|recognition|order|deliveredAt/i,
    );
  });

  it.each([
    ['expirado', { expiresAt: new Date('2020-01-01T00:00:00.000Z'), recognitions: [] }],
    [
      'revogado ou de outro escopo',
      { expiresAt: new Date('2099-01-01T00:00:00.000Z'), recognitions: [] },
    ],
  ])('oculta a seção para reconhecimento %s', async (_case, device) => {
    mocks.storefrontDeviceFindUnique.mockResolvedValue(device);

    await expect(
      getRecentPurchasedProductsForCurrentDevice({
        tenantId: 'tenant-a',
        storeId: 'store-a',
      }),
    ).resolves.toEqual([]);
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
    expect(mocks.productFindMany).not.toHaveBeenCalled();
  });

  it('oculta a seção quando nenhum pedido ou produto atual é elegível', async () => {
    mocks.orderFindMany.mockResolvedValueOnce([]);

    await expect(
      getRecentPurchasedProductsForCurrentDevice({
        tenantId: 'tenant-a',
        storeId: 'store-a',
      }),
    ).resolves.toEqual([]);
    expect(mocks.productFindMany).not.toHaveBeenCalled();

    mocks.orderFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
        deliveredAt: null,
        items: [{ productId: '00000000-0000-0000-0002-000000000001' }],
      },
    ]);
    mocks.productFindMany.mockResolvedValueOnce([]);

    await expect(
      getRecentPurchasedProductsForCurrentDevice({
        tenantId: 'tenant-a',
        storeId: 'store-a',
      }),
    ).resolves.toEqual([]);
  });
});
