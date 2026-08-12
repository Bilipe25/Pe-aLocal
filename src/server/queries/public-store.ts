import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import { resolvePublicCustomization } from '@/features/customization/public';
import { storeAssetUrl } from '@/features/assets/urls';
import { isMercadoPagoEnabled } from '@/lib/mercado-pago/config';
import type { RankedCartRecommendation } from '@/features/storefront/cart-recommendations';
import { CACHE_TAGS } from '@/server/cache';
import { getDb } from '@/server/database/client';
import * as bannerRepo from '@/server/repositories/store-banner.repository';
import * as domainRepo from '@/server/repositories/store-domain.repository';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';
import type {
  PublicDeliveryZoneDto,
  PublicStorefrontBannerDto,
  PublicStorefrontCategoryDto,
  PublicStorefrontCategoryImageDto,
  PublicStorefrontProductDetailDto,
} from '@/types/storefront';

const PUBLIC_CACHE_SECONDS = 60;

const publicStoreSelect = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  description: true,
  phone: true,
  whatsapp: true,
  logoUrl: true,
  coverUrl: true,
  status: true,
  isActive: true,
  settings: {
    select: {
      primaryColor: true,
      secondaryColor: true,
      fontFamily: true,
      minOrderValue: true,
      estimatedTime: true,
      estimatedTimeMinMinutes: true,
      estimatedTimeMaxMinutes: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      acceptsPix: true,
      acceptsCash: true,
      acceptsCardOnDelivery: true,
      showEstimatedTimeInHero: true,
      showFulfillmentInHero: true,
      showMinOrderValueInHero: true,
      showOpeningHoursInHero: true,
      showFullAddressInStoreInfo: true,
      showRecentPurchasesSection: true,
      showFeaturedProductsSection: true,
    },
  },
  customization: {
    // Contrato público intencionalmente não seleciona draftConfig nem revisões.
    select: {
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    },
  },
  address: {
    select: {
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
    },
  },
  openingHours: {
    where: { isActive: true },
    orderBy: { dayOfWeek: 'asc' },
    select: {
      dayOfWeek: true,
      openTime: true,
      closeTime: true,
    },
  },
} as const;

const publicPurchaseStoreSelect = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  timeZone: true,
  logoUrl: true,
  settings: {
    select: {
      primaryColor: true,
      secondaryColor: true,
      fontFamily: true,
      minOrderValue: true,
      deliveryEnabled: true,
      pickupEnabled: true,
      acceptsPix: true,
      acceptsCash: true,
      acceptsCardOnDelivery: true,
      paymentMode: true,
    },
  },
  entitlement: { select: { onlinePaymentsEnabled: true } },
  paymentProviderConnections: {
    where: { provider: 'MERCADO_PAGO', status: 'ACTIVE' },
    take: 1,
    select: { id: true },
  },
  customization: {
    select: {
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    },
  },
  address: {
    select: {
      city: true,
      state: true,
    },
  },
} as const;

async function getStoreFromDb(slug: string) {
  const db = getDb();
  let store = await db.store.findUnique({
    where: { slug },
    select: publicStoreSelect,
  });

  if (!store) {
    const redirect = await db.storeSlugRedirect.findUnique({
      where: { oldSlug: slug },
      select: { store: { select: publicStoreSelect } },
    });
    store = redirect?.store ?? null;
  }

  if (!store) return null;

  const { customization, address, ...publicStore } = store;
  const publicAddress = address
    ? store.settings?.showFullAddressInStoreInfo
      ? address
      : {
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
        }
    : null;
  const resolvedCustomization = resolvePublicCustomization({
    publishedConfig: customization?.publishedConfig,
    publishedVersion: customization?.publishedVersion,
    publishedAt: customization?.publishedAt,
    legacy: {
      primaryColor: store.settings?.primaryColor,
      secondaryColor: store.settings?.secondaryColor,
      fontFamily: store.settings?.fontFamily,
    },
  });
  const identityAssetIds = [
    resolvedCustomization.config.identity.logoAssetId,
    resolvedCustomization.config.identity.logoDarkAssetId,
    resolvedCustomization.config.identity.coverAssetId,
    resolvedCustomization.config.identity.faviconAssetId,
    resolvedCustomization.config.identity.socialImageAssetId,
  ].filter((id): id is string => Boolean(id));
  const categoryImageAssociations = resolvedCustomization.config.layout.showCategoryImages
    ? resolvedCustomization.config.categoryImages
    : [];
  const referencedAssetIds = [
    ...new Set([
      ...identityAssetIds,
      ...categoryImageAssociations.map((association) => association.assetId),
    ]),
  ];
  const [assets, banners, primaryDomain] = await Promise.all([
    referencedAssetIds.length > 0
      ? getDb().storeAsset.findMany({
          where: {
            id: { in: referencedAssetIds },
            tenantId: store.tenantId,
            storeId: store.id,
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
        })
      : Promise.resolve([]),
    bannerRepo.listPublicStoreBanners(store.tenantId, store.id, new Date()),
    domainRepo.findActivePrimaryStoreDomain(store.tenantId, store.id),
  ]);
  const couponDestinations = [
    ...new Set(
      banners.flatMap((banner) =>
        banner.destinationType === 'COUPON' && banner.destinationValue
          ? [banner.destinationValue]
          : [],
      ),
    ),
  ];
  const bannerCoupons =
    couponDestinations.length > 0
      ? await getDb().coupon.findMany({
          where: {
            tenantId: store.tenantId,
            storeId: store.id,
            OR: [
              { id: { in: couponDestinations } },
              { code: { in: couponDestinations, mode: 'insensitive' } },
            ],
          },
          select: { id: true, code: true },
        })
      : [];
  const couponCodeByDestination = new Map(
    bannerCoupons.flatMap((coupon) => [
      [coupon.id, coupon.code] as const,
      [coupon.code.toUpperCase(), coupon.code] as const,
    ]),
  );
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const resolveAsset = (id: string | null, type: string, width?: number) => {
    if (!id) return null;
    const asset = assetById.get(id);
    return asset?.assetType === type
      ? { id: asset.id, altText: asset.altText, url: storeAssetUrl(asset.id, width) }
      : null;
  };
  const resolveBannerHref = (type: string, value: string | null) => {
    if (!value || type === 'NONE') return null;
    if (type === 'CATEGORY') return `#category-${value}`;
    if (type === 'PRODUCT') return `#product-${value}`;
    if (type === 'COUPON') {
      const code =
        couponCodeByDestination.get(value) ??
        couponCodeByDestination.get(value.toUpperCase()) ??
        value.toUpperCase();
      return `/${store.slug}?coupon=${encodeURIComponent(code)}`;
    }
    return value;
  };
  const publicBanners = banners.map((banner): PublicStorefrontBannerDto => ({
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    buttonText: banner.buttonText,
    href: resolveBannerHref(banner.destinationType, banner.destinationValue),
    priority: banner.priority,
    imageAssetId: banner.asset?.id ?? null,
    imageUrl: banner.asset ? storeAssetUrl(banner.asset.id, 1280) : null,
    imageAlt: banner.asset?.altText ?? banner.title,
  }));

  return {
    ...publicStore,
    address: publicAddress,
    customization: {
      ...resolvedCustomization,
      assets: {
        logo: resolveAsset(resolvedCustomization.config.identity.logoAssetId, 'LOGO', 384),
        logoDark: resolveAsset(
          resolvedCustomization.config.identity.logoDarkAssetId,
          'LOGO_DARK',
          384,
        ),
        cover: resolveAsset(resolvedCustomization.config.identity.coverAssetId, 'COVER', 1280),
        favicon: resolveAsset(resolvedCustomization.config.identity.faviconAssetId, 'FAVICON', 96),
        socialImage: resolveAsset(
          resolvedCustomization.config.identity.socialImageAssetId,
          'SOCIAL_IMAGE',
          1280,
        ),
      },
      categoryImages: categoryImageAssociations.flatMap((association) => {
        const asset = assetById.get(association.assetId);
        if (asset?.assetType !== 'CATEGORY_IMAGE') return [];
        return [
          {
            categoryId: association.categoryId,
            image: {
              id: asset.id,
              url: storeAssetUrl(asset.id, 384),
              altText: asset.altText,
              width: asset.width,
              height: asset.height,
            },
          },
        ];
      }),
      banners: publicBanners,
      primaryDomain,
    },
  };
}

/** Busca os dados públicos da loja e somente sua personalização publicada. */
async function getPublicStoreBySlugForRequest(slug: string) {
  const store = await unstable_cache(() => getStoreFromDb(slug), ['public-store', slug], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.storeSlug(slug)],
  })();
  if (!store) return null;

  // O snapshot visual pode ser cacheado; disponibilidade depende do relógio e
  // precisa ser recalculada a cada request.
  const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id);
  return { ...store, availability };
}

interface PublicStorefrontSitemapEntry {
  slug: string;
  lastModified: Date;
}

async function getPublicStorefrontSitemapEntriesFromDb(): Promise<PublicStorefrontSitemapEntry[]> {
  const stores = await getDb().store.findMany({
    where: {
      isActive: true,
      tenant: { status: 'ACTIVE' },
    },
    orderBy: { slug: 'asc' },
    select: {
      slug: true,
      updatedAt: true,
      settings: {
        select: {
          primaryColor: true,
          secondaryColor: true,
          fontFamily: true,
        },
      },
      customization: {
        select: {
          publishedConfig: true,
          publishedAt: true,
        },
      },
      categories: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { updatedAt: true },
      },
      products: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { updatedAt: true },
      },
    },
  });

  return stores.flatMap((store) => {
    const config = resolvePublicCustomization({
      publishedConfig: store.customization?.publishedConfig,
      publishedAt: store.customization?.publishedAt,
      legacy: {
        primaryColor: store.settings?.primaryColor,
        secondaryColor: store.settings?.secondaryColor,
        fontFamily: store.settings?.fontFamily,
      },
    });
    if (!config.config.seo.indexable) return [];

    const catalogUpdatedAt = [
      store.updatedAt,
      store.customization?.publishedAt,
      store.categories[0]?.updatedAt,
      store.products[0]?.updatedAt,
    ].filter((value): value is Date => value instanceof Date);
    const lastModified = catalogUpdatedAt.reduce(
      (latest, current) => (current > latest ? current : latest),
      new Date(0),
    );

    return [{ slug: store.slug, lastModified }];
  });
}

export async function getPublicStorefrontSitemapEntries() {
  return unstable_cache(getPublicStorefrontSitemapEntriesFromDb, ['public-storefront-sitemap'], {
    revalidate: 300,
  })();
}

/**
 * Deduplica layout, metadata e page somente dentro do request RSC atual.
 * O snapshot visual continua com cache persistente, enquanto a disponibilidade
 * é recalculada em cada novo request.
 */
export const getPublicStoreBySlug = cache(getPublicStoreBySlugForRequest);

async function getPurchaseStoreFromDb(slug: string) {
  const db = getDb();
  let store = await db.store.findUnique({
    where: { slug },
    select: publicPurchaseStoreSelect,
  });

  if (!store) {
    const redirect = await db.storeSlugRedirect.findUnique({
      where: { oldSlug: slug },
      select: { store: { select: publicPurchaseStoreSelect } },
    });
    store = redirect?.store ?? null;
  }

  if (!store) return null;

  const resolvedCustomization = resolvePublicCustomization({
    publishedConfig: store.customization?.publishedConfig,
    publishedVersion: store.customization?.publishedVersion,
    publishedAt: store.customization?.publishedAt,
    legacy: {
      primaryColor: store.settings?.primaryColor,
      secondaryColor: store.settings?.secondaryColor,
      fontFamily: store.settings?.fontFamily,
    },
  });
  const logoAssetId = resolvedCustomization.config.identity.logoAssetId;
  const logoAsset = logoAssetId
    ? await db.storeAsset.findFirst({
        where: {
          id: logoAssetId,
          tenantId: store.tenantId,
          storeId: store.id,
          assetType: 'LOGO',
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      })
    : null;

  const paymentMode = store.settings?.paymentMode ?? 'MANUAL';
  const publicSettings = store.settings
    ? {
        primaryColor: store.settings.primaryColor,
        secondaryColor: store.settings.secondaryColor,
        fontFamily: store.settings.fontFamily,
        minOrderValue: store.settings.minOrderValue,
        deliveryEnabled: store.settings.deliveryEnabled,
        pickupEnabled: store.settings.pickupEnabled,
        acceptsPix: store.settings.acceptsPix,
        acceptsCash: store.settings.acceptsCash,
        acceptsCardOnDelivery: store.settings.acceptsCardOnDelivery,
      }
    : null;
  const onlinePayment =
    isMercadoPagoEnabled() &&
    store.entitlement?.onlinePaymentsEnabled === true &&
    paymentMode === 'ONLINE' &&
    store.paymentProviderConnections.length > 0;
  const methods = publicSettings
    ? [
        publicSettings.acceptsPix ? ('PIX' as const) : null,
        publicSettings.acceptsCash ? ('CASH' as const) : null,
        publicSettings.acceptsCardOnDelivery ? ('CARD_ON_DELIVERY' as const) : null,
      ].filter((method): method is 'PIX' | 'CASH' | 'CARD_ON_DELIVERY' => method !== null)
    : [];

  return {
    id: store.id,
    tenantId: store.tenantId,
    name: store.name,
    slug: store.slug,
    timeZone: store.timeZone,
    logoUrl: store.logoUrl,
    settings: publicSettings,
    paymentConfig: onlinePayment
      ? ({
          mode: 'ONLINE',
          provider: 'MERCADO_PAGO',
          method: 'PIX',
          requiresEmail: true,
        } as const)
      : ({ mode: 'MANUAL', methods } as const),
    address: store.address,
    customization: {
      assets: {
        logo: logoAsset
          ? {
              id: logoAsset.id,
              url: storeAssetUrl(logoAsset.id, 384),
            }
          : null,
      },
    },
  };
}

async function getPublicPurchaseStoreBySlugForRequest(slug: string) {
  const store = await unstable_cache(
    () => getPurchaseStoreFromDb(slug),
    ['public-purchase-store', slug],
    {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [CACHE_TAGS.storeSlug(slug)],
    },
  )();
  if (!store) return null;

  const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id);
  return { ...store, availability };
}

/**
 * Snapshot público mínimo para carrinho e checkout. Evita carregar banners,
 * domínios, cupons promocionais e assets que não participam do fluxo de compra.
 */
export const getPublicPurchaseStoreBySlug = cache(getPublicPurchaseStoreBySlugForRequest);

async function getPublicStoreScopeFromDb(slug: string) {
  const select = { id: true, tenantId: true, slug: true } as const;
  const store = await getDb().store.findUnique({
    where: { slug },
    select,
  });
  if (store) return store;

  const redirect = await getDb().storeSlugRedirect.findUnique({
    where: { oldSlug: slug },
    select: { store: { select } },
  });
  return redirect?.store ?? null;
}

export async function getPublicStoreScopeBySlug(slug: string) {
  return unstable_cache(() => getPublicStoreScopeFromDb(slug), ['public-store-scope', slug], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.storeSlug(slug)],
  })();
}

export async function getCanonicalPublicStoreSlug(slug: string) {
  const current = await getDb().store.findUnique({
    where: { slug },
    select: { slug: true },
  });
  if (current) return current.slug;

  const redirect = await getDb().storeSlugRedirect.findUnique({
    where: { oldSlug: slug },
    select: { store: { select: { slug: true } } },
  });
  return redirect?.store.slug ?? null;
}

async function getCatalogFromDb(
  storeId: string,
  tenantId: string,
): Promise<Omit<PublicStorefrontCategoryDto, 'image'>[]> {
  const categories = await getDb().category.findMany({
    where: { storeId, tenantId, isActive: true, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      products: {
        where: {
          tenantId,
          storeId,
          isAvailable: true,
          archivedAt: null,
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          imageAssetId: true,
          basePrice: true,
          isFeatured: true,
          isSoldOut: true,
        },
      },
    },
  });

  return categories
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      ...category,
      products: category.products.map((product) => ({
        ...product,
        imageUrl: product.imageAssetId
          ? storeAssetUrl(product.imageAssetId, 384)
          : product.imageUrl,
      })),
    }));
}

async function getPublicProductDetailFromDb(
  storeId: string,
  tenantId: string,
  productId: string,
): Promise<PublicStorefrontProductDetailDto | null> {
  const product = await getDb().product.findFirst({
    where: {
      id: productId,
      tenantId,
      storeId,
      isAvailable: true,
      archivedAt: null,
      category: {
        tenantId,
        storeId,
        isActive: true,
        archivedAt: null,
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      imageAssetId: true,
      basePrice: true,
      isFeatured: true,
      isSoldOut: true,
      allowNotes: true,
      optionGroups: {
        where: { isActive: true, archivedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          isRequired: true,
          isMultiple: true,
          minSelections: true,
          maxSelections: true,
          options: {
            where: { isAvailable: true, archivedAt: null },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              price: true,
            },
          },
        },
      },
    },
  });

  if (!product) return null;
  return {
    ...product,
    imageUrl: product.imageAssetId ? storeAssetUrl(product.imageAssetId, 768) : product.imageUrl,
  };
}

export async function getPublicProductDetail(
  storeId: string,
  tenantId: string,
  productId: string,
): Promise<PublicStorefrontProductDetailDto | null> {
  return unstable_cache(
    () => getPublicProductDetailFromDb(storeId, tenantId, productId),
    ['public-product-detail', storeId, tenantId, productId],
    {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [CACHE_TAGS.catalog(storeId)],
    },
  )();
}

async function getPublicCartRecommendationCandidatesFromDb(
  storeId: string,
  tenantId: string,
): Promise<RankedCartRecommendation[]> {
  const categories = await getDb().category.findMany({
    where: {
      tenantId,
      storeId,
      isActive: true,
      archivedAt: null,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      sortOrder: true,
      products: {
        where: {
          tenantId,
          storeId,
          isAvailable: true,
          isSoldOut: false,
          archivedAt: null,
          basePrice: { gt: 0 },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          imageUrl: true,
          imageAssetId: true,
          basePrice: true,
          isAvailable: true,
          isFeatured: true,
          sortOrder: true,
          optionGroups: {
            where: { isActive: true, archivedAt: null },
            select: {
              isRequired: true,
              minSelections: true,
              _count: {
                select: {
                  options: { where: { isAvailable: true, archivedAt: null } },
                },
              },
            },
          },
        },
      },
    },
  });

  return categories.flatMap((category) =>
    category.products.flatMap((product) => {
      const hasImpossibleRequiredGroup = product.optionGroups.some(
        (group) => group.isRequired && group._count.options < group.minSelections,
      );
      if (hasImpossibleRequiredGroup) return [];

      return [
        {
          id: product.id,
          name: product.name,
          basePrice: product.basePrice,
          imageUrl: product.imageAssetId
            ? storeAssetUrl(product.imageAssetId, 256)
            : product.imageUrl,
          imageAssetId: product.imageAssetId,
          category: { id: category.id, name: category.name },
          isAvailable: product.isAvailable,
          isFeatured: product.isFeatured,
          requiresConfiguration: product.optionGroups.some((group) => group._count.options > 0),
          categorySortOrder: category.sortOrder,
          productSortOrder: product.sortOrder,
        },
      ];
    }),
  );
}

/**
 * Pool interno, compacto e cacheado. A rota pública reduz este conjunto para
 * no máximo oito itens depois de excluir os produtos presentes no carrinho.
 */
export async function getPublicCartRecommendationCandidates(storeId: string, tenantId: string) {
  return unstable_cache(
    () => getPublicCartRecommendationCandidatesFromDb(storeId, tenantId),
    ['public-cart-recommendations', storeId, tenantId],
    {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [CACHE_TAGS.catalog(storeId)],
    },
  )();
}

async function getPublicCatalogForRequest(
  storeId: string,
  tenantId: string,
  categoryImages: {
    categoryId: string;
    image: PublicStorefrontCategoryImageDto;
  }[] = [],
): Promise<PublicStorefrontCategoryDto[]> {
  const catalog = await unstable_cache(
    () => getCatalogFromDb(storeId, tenantId),
    ['public-catalog', storeId, tenantId],
    {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [CACHE_TAGS.catalog(storeId)],
    },
  )();
  const imageByCategoryId = new Map(
    categoryImages.map((association) => [association.categoryId, association.image]),
  );
  return catalog.map((category) => ({
    ...category,
    image: imageByCategoryId.get(category.id) ?? null,
  }));
}

/**
 * Deduplica catálogo dentro do request RSC atual. O cache persistente do Next.js
 * continua aplicado, mas o wrapper `cache` evita execuções duplicadas quando o
 * catálogo é consultado mais de uma vez no mesmo request (metadata, page, etc.).
 */
export const getPublicCatalog = cache(getPublicCatalogForRequest);

async function getDeliveryZonesFromDb(storeId: string): Promise<PublicDeliveryZoneDto[]> {
  return getDb().deliveryZone.findMany({
    where: {
      storeId,
      isActive: true,
      postalRanges: {
        some: { isActive: true },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      fee: true,
      estimatedTime: true,
      minOrderValue: true,
    },
  });
}

export async function getPublicDeliveryZones(storeId: string): Promise<PublicDeliveryZoneDto[]> {
  return unstable_cache(() => getDeliveryZonesFromDb(storeId), ['public-delivery-zones', storeId], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.delivery(storeId)],
  })();
}
