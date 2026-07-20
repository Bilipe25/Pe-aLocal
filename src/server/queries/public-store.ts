import 'server-only';

import { unstable_cache } from 'next/cache';

import { resolvePublicCustomization } from '@/features/customization/public';
import { storeAssetUrl } from '@/features/assets/urls';
import { CACHE_TAGS } from '@/server/cache';
import { getDb } from '@/server/database/client';
import * as bannerRepo from '@/server/repositories/store-banner.repository';
import * as domainRepo from '@/server/repositories/store-domain.repository';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';

const PUBLIC_CACHE_SECONDS = 60;

async function getStoreFromDb(slug: string) {
  const store = await getDb().store.findUnique({
    where: { slug },
    select: {
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
          deliveryEnabled: true,
          pickupEnabled: true,
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
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
          neighborhood: true,
          city: true,
          state: true,
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
    },
  });

  if (!store) return null;

  const { customization, ...publicStore } = store;
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
    if (type === 'COUPON') return `/${store.slug}?coupon=${encodeURIComponent(value)}`;
    return value;
  };

  return {
    ...publicStore,
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
      banners: banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        subtitle: banner.subtitle,
        buttonText: banner.buttonText,
        href: resolveBannerHref(banner.destinationType, banner.destinationValue),
        priority: banner.priority,
        imageAssetId: banner.asset?.id ?? null,
        imageUrl: banner.asset ? storeAssetUrl(banner.asset.id, 1280) : null,
        imageAlt: banner.asset?.altText ?? banner.title,
      })),
      primaryDomain,
    },
  };
}

/** Busca os dados públicos da loja e somente sua personalização publicada. */
export async function getPublicStoreBySlug(slug: string) {
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

async function getCatalogFromDb(storeId: string, tenantId: string) {
  const categories = await getDb().category.findMany({
    where: { storeId, tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      products: {
        where: { isAvailable: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          basePrice: true,
          isFeatured: true,
          isSoldOut: true,
          allowNotes: true,
          optionGroups: {
            where: { isActive: true },
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
                where: { isAvailable: true },
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
      },
    },
  });

  return categories.filter((category) => category.products.length > 0);
}

export async function getPublicCatalog(
  storeId: string,
  tenantId: string,
  categoryImages: {
    categoryId: string;
    image: {
      id: string;
      url: string;
      altText: string;
      width: number;
      height: number;
    };
  }[] = [],
) {
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

async function getDeliveryZonesFromDb(storeId: string) {
  return getDb().deliveryZone.findMany({
    where: { storeId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      fee: true,
      estimatedTime: true,
      minOrderValue: true,
    },
  });
}

export async function getPublicDeliveryZones(storeId: string) {
  return unstable_cache(() => getDeliveryZonesFromDb(storeId), ['public-delivery-zones', storeId], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.delivery(storeId)],
  })();
}
