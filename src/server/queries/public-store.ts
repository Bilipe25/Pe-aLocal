import 'server-only';

import { unstable_cache } from 'next/cache';

import { resolvePublicCustomization } from '@/features/customization/public';
import { storeAssetUrl } from '@/features/assets/urls';
import { CACHE_TAGS } from '@/server/cache';
import { getDb } from '@/server/database/client';

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

  if (!store || !store.isActive) return null;

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
  const assets =
    identityAssetIds.length > 0
      ? await getDb().storeAsset.findMany({
          where: {
            id: { in: identityAssetIds },
            tenantId: store.tenantId,
            storeId: store.id,
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: { id: true, assetType: true, altText: true },
        })
      : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const resolveAsset = (id: string | null, width?: number) => {
    if (!id) return null;
    const asset = assetById.get(id);
    return asset ? { id: asset.id, altText: asset.altText, url: storeAssetUrl(asset.id, width) } : null;
  };

  return {
    ...publicStore,
    customization: {
      ...resolvedCustomization,
      assets: {
        logo: resolveAsset(resolvedCustomization.config.identity.logoAssetId, 384),
        logoDark: resolveAsset(resolvedCustomization.config.identity.logoDarkAssetId, 384),
        cover: resolveAsset(resolvedCustomization.config.identity.coverAssetId, 1280),
        favicon: resolveAsset(resolvedCustomization.config.identity.faviconAssetId, 96),
        socialImage: resolveAsset(resolvedCustomization.config.identity.socialImageAssetId, 1280),
      },
    },
  };
}

/** Busca os dados públicos da loja e somente sua personalização publicada. */
export async function getPublicStoreBySlug(slug: string) {
  return unstable_cache(() => getStoreFromDb(slug), ['public-store', slug], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.storeSlug(slug)],
  })();
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

export async function getPublicCatalog(storeId: string, tenantId: string) {
  return unstable_cache(
    () => getCatalogFromDb(storeId, tenantId),
    ['public-catalog', storeId, tenantId],
    {
      revalidate: PUBLIC_CACHE_SECONDS,
      tags: [CACHE_TAGS.catalog(storeId)],
    },
  )();
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
