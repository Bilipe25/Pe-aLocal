import 'server-only';

import { unstable_cache } from 'next/cache';
import { db } from '@/server/database/client';

// =============================================================================
// Queries Públicas da Loja (com cache)
// =============================================================================

async function getStoreFromDb(slug: string) {
  const store = await db.store.findUnique({
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
          minOrderValue: true,
          estimatedTime: true,
          deliveryEnabled: true,
          pickupEnabled: true,
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
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
  return store;
}

/**
 * Busca uma loja pública pelo slug, com todas as informações necessárias
 * para renderizar a storefront. Usando cache do Next.js.
 */
export const getPublicStoreBySlug = unstable_cache(
  async (slug: string) => getStoreFromDb(slug),
  ['public-store'], // cache key
  { revalidate: 60, tags: ['store'] } // revalidate a cada 60s ou quando tag for invalidada
);

async function getCatalogFromDb(storeId: string, tenantId: string) {
  const categories = await db.category.findMany({
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

  // Filtrar categorias sem produtos disponíveis
  return categories.filter((c) => c.products.length > 0);
}

/**
 * Busca o catálogo público (categorias + produtos + adicionais)
 * de uma loja ativa. Usando cache do Next.js.
 */
export const getPublicCatalog = unstable_cache(
  async (storeId: string, tenantId: string) => getCatalogFromDb(storeId, tenantId),
  ['public-catalog'],
  { revalidate: 60, tags: ['catalog'] }
);
