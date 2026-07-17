import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import {
  getPublicCatalog,
  getPublicDeliveryZones,
  getPublicStoreBySlug,
} from '@/server/queries/public-store';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  unstableCache: vi.fn(),
  storeFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  deliveryZoneFindMany: vi.fn(),
  storeAssetFindMany: vi.fn(),
  listPublicStoreBanners: vi.fn(),
  findActivePrimaryStoreDomain: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: mocks.unstableCache }));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/repositories/store-banner.repository', () => ({
  listPublicStoreBanners: mocks.listPublicStoreBanners,
}));
vi.mock('@/server/repositories/store-domain.repository', () => ({
  findActivePrimaryStoreDomain: mocks.findActivePrimaryStoreDomain,
}));

function publicStore() {
  return {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: 'Loja 1',
    slug: 'loja-1',
    description: null,
    phone: null,
    whatsapp: null,
    logoUrl: null,
    coverUrl: null,
    status: 'OPEN' as const,
    isActive: true,
    settings: {
      primaryColor: '#D9480F',
      secondaryColor: '#241C15',
      fontFamily: 'Inter',
      minOrderValue: 0,
      estimatedTime: '30-50 min',
      deliveryEnabled: true,
      pickupEnabled: true,
      acceptsPix: true,
      acceptsCash: true,
      acceptsCardOnDelivery: true,
    },
    customization: {
      publishedConfig: createDefaultCustomization(),
      publishedVersion: 2,
      publishedAt: new Date('2026-07-17T15:00:00Z'),
    },
    address: null,
    openingHours: [],
  };
}

describe('queries públicas da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unstableCache.mockImplementation(
      (callback: () => Promise<unknown>) => callback,
    );
    mocks.storeFindUnique.mockResolvedValue(publicStore());
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.deliveryZoneFindMany.mockResolvedValue([]);
    mocks.storeAssetFindMany.mockResolvedValue([]);
    mocks.listPublicStoreBanners.mockResolvedValue([]);
    mocks.findActivePrimaryStoreDomain.mockResolvedValue(null);
    mocks.getDb.mockReturnValue({
      store: { findUnique: mocks.storeFindUnique },
      category: { findMany: mocks.categoryFindMany },
      deliveryZone: { findMany: mocks.deliveryZoneFindMany },
      storeAsset: { findMany: mocks.storeAssetFindMany },
    });
  });

  it('resolve apenas assets publicados, ativos e pertencentes à mesma loja', async () => {
    const assetId = '4da03571-bffd-45ef-8c44-20686c487838';
    const store = publicStore();
    const config = createDefaultCustomization();
    config.identity.logoAssetId = assetId;
    store.customization.publishedConfig = config;
    mocks.storeFindUnique.mockResolvedValue(store);
    mocks.storeAssetFindMany.mockResolvedValue([
      { id: assetId, assetType: 'LOGO', altText: 'Logo da loja' },
    ]);

    const result = await getPublicStoreBySlug('loja-1');

    expect(mocks.storeAssetFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [assetId] },
        tenantId: 'tenant-1',
        storeId: 'store-1',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, assetType: true, altText: true },
    });
    expect(result?.customization.assets.logo).toEqual({
      id: assetId,
      altText: 'Logo da loja',
      url: `/api/store-assets/${assetId}?width=384`,
    });
  });

  it('seleciona publishedConfig sem carregar draft ou histórico', async () => {
    const result = await getPublicStoreBySlug('loja-1');
    const query = mocks.storeFindUnique.mock.calls[0][0];
    const customizationSelect = query.select.customization.select;

    expect(customizationSelect).toEqual({
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    });
    expect(customizationSelect).not.toHaveProperty('draftConfig');
    expect(customizationSelect).not.toHaveProperty('revisions');
    expect(result?.customization.config.identity.slogan).toBe('');
  });

  it('retorna somente banners públicos resolvidos e o domínio primário ativo', async () => {
    mocks.listPublicStoreBanners.mockResolvedValue([
      {
        id: 'banner-1',
        title: 'Frete grátis',
        subtitle: 'Hoje',
        buttonText: 'Ver categoria',
        destinationType: 'CATEGORY',
        destinationValue: 'category-1',
        priority: 10,
        asset: { id: 'asset-banner', altText: 'Frete grátis' },
      },
    ]);
    mocks.findActivePrimaryStoreDomain.mockResolvedValue({
      id: 'domain-1',
      hostname: 'cardapio.exemplo.com.br',
      domainType: 'CUSTOM',
    });

    const result = await getPublicStoreBySlug('loja-1');

    expect(mocks.listPublicStoreBanners).toHaveBeenCalledWith(
      'tenant-1',
      'store-1',
      expect.any(Date),
    );
    expect(result?.customization.banners).toEqual([
      expect.objectContaining({
        id: 'banner-1',
        href: '#category-category-1',
        imageUrl: '/api/store-assets/asset-banner?width=1280',
      }),
    ]);
    expect(result?.customization.primaryDomain?.hostname).toBe('cardapio.exemplo.com.br');
  });

  it('isola as tags de store, catálogo e entrega', async () => {
    await getPublicStoreBySlug('loja-1');
    await getPublicCatalog('store-1', 'tenant-1');
    await getPublicDeliveryZones('store-1');

    expect(mocks.unstableCache.mock.calls[0][2].tags).toEqual(['store-slug:loja-1']);
    expect(mocks.unstableCache.mock.calls[1][2].tags).toEqual(['catalog:store-1']);
    expect(mocks.unstableCache.mock.calls[2][2].tags).toEqual(['delivery:store-1']);
  });
});
