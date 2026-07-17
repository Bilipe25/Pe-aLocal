import 'server-only';

import { unstable_cache } from 'next/cache';

import { resolvePublicCustomization } from '@/features/customization/public';
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
  return {
    ...publicStore,
    customization: resolvePublicCustomization({
      publishedConfig: customization?.publishedConfig,
      publishedVersion: customization?.publishedVersion,
      publishedAt: customization?.publishedAt,
      legacy: {
        primaryColor: store.settings?.primaryColor,
        secondaryColor: store.settings?.secondaryColor,
        fontFamily: store.settings?.fontFamily,
      },
    }),
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
