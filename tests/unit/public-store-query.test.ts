import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import {
  getPublicCatalog,
  getPublicCartRecommendationCandidates,
  getCanonicalPublicStoreSlug,
  getPublicDeliveryZones,
  getPublicPurchaseStoreBySlug,
  getPublicProductDetail,
  getPublicStoreBySlug,
  getPublicStorefrontSitemapEntries,
} from '@/server/queries/public-store';

const mocks = vi.hoisted(() => ({
  requestId: 0,
  getDb: vi.fn(),
  unstableCache: vi.fn(),
  storeFindUnique: vi.fn(),
  storeFindMany: vi.fn(),
  storeSlugRedirectFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  productFindFirst: vi.fn(),
  deliveryZoneFindMany: vi.fn(),
  storeAssetFindMany: vi.fn(),
  listPublicStoreBanners: vi.fn(),
  findActivePrimaryStoreDomain: vi.fn(),
  getEffectiveStoreAvailabilityForTenant: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(callback: (...args: Args) => Result) => {
      let activeRequestId = -1;
      let values = new Map<string, Result>();
      return (...args: Args) => {
        if (activeRequestId !== mocks.requestId) {
          activeRequestId = mocks.requestId;
          values = new Map();
        }
        const key = JSON.stringify(args);
        if (!values.has(key)) values.set(key, callback(...args));
        return values.get(key)!;
      };
    },
  };
});
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
      showEstimatedTimeInHero: true,
      showFulfillmentInHero: false,
      showMinOrderValueInHero: true,
      showOpeningHoursInHero: false,
      showFullAddressInStoreInfo: false,
      showRecentPurchasesSection: true,
      showFeaturedProductsSection: true,
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
    mocks.requestId += 1;
    mocks.unstableCache.mockImplementation((callback: () => Promise<unknown>) => callback);
    mocks.storeFindUnique.mockResolvedValue(publicStore());
    mocks.storeFindMany.mockResolvedValue([]);
    mocks.storeSlugRedirectFindUnique.mockResolvedValue(null);
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.productFindFirst.mockResolvedValue(null);
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
      store: { findUnique: mocks.storeFindUnique, findMany: mocks.storeFindMany },
      storeSlugRedirect: { findUnique: mocks.storeSlugRedirectFindUnique },
      category: { findMany: mocks.categoryFindMany },
      product: { findFirst: mocks.productFindFirst },
      deliveryZone: { findMany: mocks.deliveryZoneFindMany },
      storeAsset: { findMany: mocks.storeAssetFindMany },
    });
  });

  it('deduplica duas chamadas do mesmo slug no mesmo request', async () => {
    const [first, second] = await Promise.all([
      getPublicStoreBySlug('loja-1'),
      getPublicStoreBySlug('loja-1'),
    ]);

    expect(first).toBe(second);
    expect(mocks.storeFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledTimes(1);
  });

  it('carrega um snapshot enxuto para carrinho e checkout', async () => {
    const result = await getPublicPurchaseStoreBySlug('loja-1');

    expect(result).toMatchObject({
      id: 'store-1',
      name: 'Loja 1',
      settings: {
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
      },
      availability: { acceptingOrders: true },
      customization: { assets: { logo: null } },
    });
    expect(mocks.storeFindUnique.mock.calls[0]?.[0]?.select).not.toHaveProperty('description');
    expect(mocks.storeFindUnique.mock.calls[0]?.[0]?.select).not.toHaveProperty('openingHours');
    expect(mocks.listPublicStoreBanners).not.toHaveBeenCalled();
    expect(mocks.findActivePrimaryStoreDomain).not.toHaveBeenCalled();
  });

  it('não compartilha resultado entre slugs no mesmo request', async () => {
    mocks.storeFindUnique.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve({
        ...publicStore(),
        id: `store-${where.slug}`,
        slug: where.slug,
      }),
    );

    const [storeA, storeB] = await Promise.all([
      getPublicStoreBySlug('loja-a'),
      getPublicStoreBySlug('loja-b'),
    ]);

    expect(storeA?.id).toBe('store-loja-a');
    expect(storeB?.id).toBe('store-loja-b');
    expect(mocks.storeFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledTimes(2);
  });

  it('recalcula disponibilidade dinâmica em requests diferentes', async () => {
    mocks.getEffectiveStoreAvailabilityForTenant
      .mockResolvedValueOnce({
        acceptingOrders: true,
        state: 'OPEN',
        reason: 'Aberta agora.',
        nextTransitionAt: null,
      })
      .mockResolvedValueOnce({
        acceptingOrders: false,
        state: 'PAUSED',
        reason: 'Loja pausada.',
        nextTransitionAt: null,
      });

    const firstRequest = await getPublicStoreBySlug('loja-1');
    mocks.requestId += 1;
    const secondRequest = await getPublicStoreBySlug('loja-1');

    expect(firstRequest?.availability.state).toBe('OPEN');
    expect(secondRequest?.availability.state).toBe('PAUSED');
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledTimes(2);
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

  it('não serializa rua, número, complemento ou CEP sem autorização explícita', async () => {
    const store = {
      ...publicStore(),
      address: {
        street: 'Rua Privada',
        number: '123',
        complement: 'Sala 2',
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'CE',
        zipCode: '60000000',
      },
    };
    mocks.storeFindUnique.mockResolvedValue(store);

    const result = await getPublicStoreBySlug('loja-1');

    expect(result?.address).toEqual({
      neighborhood: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
    });
    expect(result?.address).not.toHaveProperty('street');
    expect(result?.address).not.toHaveProperty('number');
    expect(result?.address).not.toHaveProperty('complement');
    expect(result?.address).not.toHaveProperty('zipCode');
  });

  it('serializa o endereço completo somente após autorização do estabelecimento', async () => {
    const current = publicStore();
    const store = {
      ...current,
      settings: { ...current.settings, showFullAddressInStoreInfo: true },
      address: {
        street: 'Rua Pública',
        number: '321',
        complement: null,
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'CE',
        zipCode: '60000000',
      },
    };
    mocks.storeFindUnique.mockResolvedValue(store);

    const result = await getPublicStoreBySlug('loja-1');

    expect(result?.address).toMatchObject({
      street: 'Rua Pública',
      number: '321',
      neighborhood: 'Centro',
      zipCode: '60000000',
    });
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
        products: [
          {
            id: 'product-1',
            imageUrl: 'https://legacy.invalid/image.jpg',
            imageAssetId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
          },
        ],
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
    expect(result[0].products[0].imageUrl).toBe(
      '/api/store-assets/d665460d-b4be-48e6-8cb2-33ab2e5cc8a1?width=384',
    );
    expect(mocks.categoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
        select: expect.objectContaining({
          products: expect.objectContaining({
            where: expect.objectContaining({ archivedAt: null }),
          }),
        }),
      }),
    );
  });

  it('mantém o catálogo inicial leve e escopa produtos por tenant e loja', async () => {
    mocks.categoryFindMany.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Hambúrgueres',
        description: null,
        products: [
          {
            id: '4da03571-bffd-45ef-8c44-20686c487838',
            name: 'Burger da casa',
            description: 'Pão, carne e queijo',
            imageUrl: null,
            imageAssetId: null,
            basePrice: 2_500,
            isFeatured: true,
            isSoldOut: false,
          },
        ],
      },
    ]);

    const result = await getPublicCatalog('store-1', 'tenant-1');
    const query = mocks.categoryFindMany.mock.calls[0][0];

    expect(query.select.products.where).toEqual({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      isAvailable: true,
      archivedAt: null,
    });
    expect(query.select.products.select).not.toHaveProperty('allowNotes');
    expect(query.select.products.select).not.toHaveProperty('optionGroups');
    expect(result[0].products[0]).not.toHaveProperty('allowNotes');
    expect(result[0].products[0]).not.toHaveProperty('optionGroups');
  });

  it('monta um pool compacto de recomendações sem N+1 e exclui configuração impossível', async () => {
    mocks.categoryFindMany.mockResolvedValue([
      {
        id: 'category-1',
        name: 'Bebidas',
        sortOrder: 1_000,
        products: [
          {
            id: 'product-simple',
            name: 'Água',
            imageUrl: null,
            imageAssetId: null,
            basePrice: 500,
            isAvailable: true,
            isFeatured: true,
            sortOrder: 1_000,
            optionGroups: [],
          },
          {
            id: 'product-configurable',
            name: 'Refrigerante',
            imageUrl: null,
            imageAssetId: null,
            basePrice: 700,
            isAvailable: true,
            isFeatured: false,
            sortOrder: 2_000,
            optionGroups: [
              {
                isRequired: false,
                minSelections: 0,
                _count: { options: 1 },
              },
            ],
          },
          {
            id: 'product-impossible',
            name: 'Produto incompleto',
            imageUrl: null,
            imageAssetId: null,
            basePrice: 800,
            isAvailable: true,
            isFeatured: false,
            sortOrder: 3_000,
            optionGroups: [
              {
                isRequired: true,
                minSelections: 2,
                _count: { options: 1 },
              },
            ],
          },
        ],
      },
    ]);

    const result = await getPublicCartRecommendationCandidates('store-1', 'tenant-1');
    const query = mocks.categoryFindMany.mock.calls[0][0];

    expect(mocks.categoryFindMany).toHaveBeenCalledOnce();
    expect(query.where).toEqual({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      isActive: true,
      archivedAt: null,
    });
    expect(query.select.products.where).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        isAvailable: true,
        isSoldOut: false,
        archivedAt: null,
        basePrice: { gt: 0 },
      }),
    );
    expect(query.select.products.select).not.toHaveProperty('tenantId');
    expect(query.select.products.select).not.toHaveProperty('storeId');
    expect(query.select.products.select.optionGroups.select).toEqual({
      isRequired: true,
      minSelections: true,
      _count: {
        select: {
          options: { where: { isAvailable: true, archivedAt: null } },
        },
      },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'product-simple',
        requiresConfiguration: false,
        category: { id: 'category-1', name: 'Bebidas' },
      }),
      expect.objectContaining({
        id: 'product-configurable',
        requiresConfiguration: true,
      }),
    ]);
    expect(result).not.toContainEqual(expect.objectContaining({ id: 'product-impossible' }));
  });

  it('busca o detalhe sob demanda com isolamento e somente opções públicas ativas', async () => {
    const productId = '4da03571-bffd-45ef-8c44-20686c487838';
    const imageAssetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';
    mocks.productFindFirst.mockResolvedValue({
      id: productId,
      name: 'Burger da casa',
      description: 'Pão, carne e queijo',
      imageUrl: 'https://legacy.invalid/burger.jpg',
      imageAssetId,
      basePrice: 2_500,
      isFeatured: true,
      isSoldOut: false,
      allowNotes: true,
      optionGroups: [
        {
          id: 'group-1',
          title: 'Adicionais',
          description: null,
          isRequired: false,
          isMultiple: true,
          minSelections: 0,
          maxSelections: 3,
          options: [{ id: 'option-1', name: 'Bacon', price: 400 }],
        },
      ],
    });

    const result = await getPublicProductDetail('store-1', 'tenant-1', productId);
    const query = mocks.productFindFirst.mock.calls[0][0];

    expect(query.where).toEqual({
      id: productId,
      tenantId: 'tenant-1',
      storeId: 'store-1',
      isAvailable: true,
      archivedAt: null,
      category: {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        isActive: true,
        archivedAt: null,
      },
    });
    expect(query.select.optionGroups).toMatchObject({
      where: { isActive: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        options: {
          where: { isAvailable: true, archivedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: productId,
        allowNotes: true,
        imageUrl: `/api/store-assets/${imageAssetId}?width=768`,
        optionGroups: [
          expect.objectContaining({
            id: 'group-1',
            options: [{ id: 'option-1', name: 'Bacon', price: 400 }],
          }),
        ],
      }),
    );
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['public-product-detail', 'store-1', 'tenant-1', productId],
      {
        revalidate: 60,
        tags: ['catalog:store-1'],
      },
    );
  });

  it('isola as tags de store, catálogo e entrega', async () => {
    await getPublicStoreBySlug('loja-1');
    await getPublicCatalog('store-1', 'tenant-1');
    await getPublicDeliveryZones('store-1');

    expect(mocks.unstableCache.mock.calls[0][2].tags).toEqual(['store-slug:loja-1']);
    expect(mocks.unstableCache.mock.calls[1][2].tags).toEqual(['catalog:store-1']);
    expect(mocks.unstableCache.mock.calls[2][2].tags).toEqual(['delivery:store-1']);
  });

  it('deduplica getPublicCatalog dentro do mesmo request', async () => {
    mocks.categoryFindMany.mockResolvedValue([]);

    const first = await getPublicCatalog('store-1', 'tenant-1');
    const second = await getPublicCatalog('store-1', 'tenant-1');

    expect(first).toBe(second);
    expect(mocks.categoryFindMany).toHaveBeenCalledTimes(1);
  });

  it('lista somente lojas públicas indexáveis e usa a atualização mais recente do catálogo', async () => {
    const hiddenConfig = createDefaultCustomization();
    hiddenConfig.seo.indexable = false;
    mocks.storeFindMany.mockResolvedValue([
      {
        slug: 'loja-publica',
        updatedAt: new Date('2026-07-20T10:00:00Z'),
        settings: {
          primaryColor: '#D9480F',
          secondaryColor: '#241C15',
          fontFamily: 'Inter',
        },
        customization: {
          publishedConfig: createDefaultCustomization(),
          publishedAt: new Date('2026-07-21T10:00:00Z'),
        },
        categories: [{ updatedAt: new Date('2026-07-22T10:00:00Z') }],
        products: [{ updatedAt: new Date('2026-07-23T10:00:00Z') }],
      },
      {
        slug: 'loja-privada',
        updatedAt: new Date('2026-07-23T10:00:00Z'),
        settings: {
          primaryColor: '#D9480F',
          secondaryColor: '#241C15',
          fontFamily: 'Inter',
        },
        customization: {
          publishedConfig: hiddenConfig,
          publishedAt: new Date('2026-07-23T10:00:00Z'),
        },
        categories: [],
        products: [],
      },
    ]);

    await expect(getPublicStorefrontSitemapEntries()).resolves.toEqual([
      { slug: 'loja-publica', lastModified: new Date('2026-07-23T10:00:00Z') },
    ]);
    expect(mocks.storeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, tenant: { status: 'ACTIVE' } },
      }),
    );
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['public-storefront-sitemap'],
      { revalidate: 300 },
    );
  });

  it('não depende de cookies, headers ou sessão para permitir edge caching', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/server/queries/public-store.ts'),
      'utf-8',
    );

    expect(source).not.toMatch(/from\s+['"]next\/headers['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]next\/headers['"]\s*\)/);
    expect(source).not.toMatch(/import\s*\{\s*cookies\s*\}/);
    expect(source).not.toMatch(/import\s*\{\s*headers\s*\}/);
  });
});
