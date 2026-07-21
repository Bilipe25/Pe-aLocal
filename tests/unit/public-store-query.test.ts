import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import {
  getPublicCatalog,
  getCanonicalPublicStoreSlug,
  getPublicDeliveryZones,
  getPublicStoreBySlug,
} from '@/server/queries/public-store';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  unstableCache: vi.fn(),
  storeFindUnique: vi.fn(),
  storeSlugRedirectFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  deliveryZoneFindMany: vi.fn(),
  storeAssetFindMany: vi.fn(),
  listPublicStoreBanners: vi.fn(),
  findActivePrimaryStoreDomain: vi.fn(),
  getEffectiveStoreAvailabilityForTenant: vi.fn(),
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
vi.mock('@/server/services/store-availability.service', () => ({
  getEffectiveStoreAvailabilityForTenant: mocks.getEffectiveStoreAvailabilityForTenant,
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
      estimatedTimeMinMinutes: 30,
      estimatedTimeMaxMinutes: 50,
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
    mocks.unstableCache.mockImplementation((callback: () => Promise<unknown>) => callback);
    mocks.storeFindUnique.mockResolvedValue(publicStore());
    mocks.storeSlugRedirectFindUnique.mockResolvedValue(null);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.deliveryZoneFindMany.mockResolvedValue([]);
    mocks.storeAssetFindMany.mockResolvedValue([]);
    mocks.listPublicStoreBanners.mockResolvedValue([]);
    mocks.findActivePrimaryStoreDomain.mockResolvedValue(null);
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: true,
      state: 'OPEN',
      reason: 'Aberta agora.',
      nextTransitionAt: null,
    });
    mocks.getDb.mockReturnValue({
      store: { findUnique: mocks.storeFindUnique },
      storeSlugRedirect: { findUnique: mocks.storeSlugRedirectFindUnique },
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
      select: {
        id: true,
        assetType: true,
        altText: true,
        width: true,
        height: true,
      },
    });
    expect(result?.customization.assets.logo).toEqual({
      id: assetId,
      altText: 'Logo da loja',
      url: `/api/store-assets/${assetId}?width=384`,
    });
  });

  it('resolve imagens de categoria publicadas em lote e ignora tipos incorretos', async () => {
    const categoryId = '4da03571-bffd-45ef-8c44-20686c487838';
    const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';
    const ignoredAssetId = '6c5a2835-c3c9-4b70-9ba5-8ccf748b31fd';
    const store = publicStore();
    const config = createDefaultCustomization();
    config.layout.showCategoryImages = true;
    config.categoryImages = [
      { categoryId, assetId },
      { categoryId: '0564f47e-2cc0-457a-8858-0242e770e854', assetId: ignoredAssetId },
    ];
    store.customization.publishedConfig = config;
    mocks.storeFindUnique.mockResolvedValue(store);
    mocks.storeAssetFindMany.mockResolvedValue([
      {
        id: assetId,
        assetType: 'CATEGORY_IMAGE',
        altText: 'Hambúrgueres',
        width: 800,
        height: 800,
      },
      {
        id: ignoredAssetId,
        assetType: 'LOGO',
        altText: 'Tipo incorreto',
        width: 800,
        height: 800,
      },
    ]);

    const result = await getPublicStoreBySlug('loja-1');

    expect(mocks.storeAssetFindMany).toHaveBeenCalledTimes(1);
    expect(result?.customization.categoryImages).toEqual([
      {
        categoryId,
        image: {
          id: assetId,
          url: `/api/store-assets/${assetId}?width=384`,
          altText: 'Hambúrgueres',
          width: 800,
          height: 800,
        },
      },
    ]);
  });

  it('não consulta imagens de categoria quando a exibição publicada está desligada', async () => {
    const store = publicStore();
    const config = createDefaultCustomization();
    config.categoryImages = [
      {
        categoryId: '4da03571-bffd-45ef-8c44-20686c487838',
        assetId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      },
    ];
    store.customization.publishedConfig = config;
    mocks.storeFindUnique.mockResolvedValue(store);

    const result = await getPublicStoreBySlug('loja-1');

    expect(mocks.storeAssetFindMany).not.toHaveBeenCalled();
    expect(result?.customization.categoryImages).toEqual([]);
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
    expect(result?.availability).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledWith(
      'tenant-1',
      'store-1',
    );
  });

  it('resolve slug antigo pelo histórico e retorna a loja canônica', async () => {
    const store = publicStore();
    mocks.storeFindUnique.mockResolvedValueOnce(null);
    mocks.storeSlugRedirectFindUnique.mockResolvedValueOnce({
      store,
    });

    const result = await getPublicStoreBySlug('loja-antiga');

    expect(mocks.storeSlugRedirectFindUnique).toHaveBeenCalledWith({
      where: { oldSlug: 'loja-antiga' },
      select: expect.objectContaining({
        store: expect.any(Object),
      }),
    });
    expect(result?.slug).toBe('loja-1');
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledWith(
      'tenant-1',
      'store-1',
    );
  });

  it('retorna slug canônico para rotas de acompanhamento antigas', async () => {
    mocks.storeFindUnique.mockResolvedValueOnce(null);
    mocks.storeSlugRedirectFindUnique.mockResolvedValueOnce({
      store: { slug: 'loja-1' },
    });

    await expect(getCanonicalPublicStoreSlug('loja-antiga')).resolves.toBe('loja-1');
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

  it('associa imagens ao catálogo em memória e ignora categorias removidas', async () => {
    const categoryId = '4da03571-bffd-45ef-8c44-20686c487838';
    mocks.categoryFindMany.mockResolvedValue([
      {
        id: categoryId,
        name: 'Hambúrgueres',
        description: null,
        products: [{ id: 'product-1' }],
      },
    ]);
    const image = {
      id: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      url: '/api/store-assets/image?width=384',
      altText: 'Hambúrgueres',
      width: 800,
      height: 800,
    };

    const result = await getPublicCatalog('store-1', 'tenant-1', [
      { categoryId, image },
      {
        categoryId: '0564f47e-2cc0-457a-8858-0242e770e854',
        image: { ...image, id: 'orphan' },
      },
    ]);

    expect(mocks.categoryFindMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([expect.objectContaining({ id: categoryId, image })]);
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
