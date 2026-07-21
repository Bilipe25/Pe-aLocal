import { getDb } from '@/server/database/client';

/** Lista categorias arquivadas de uma loja (para a área de restauração). */
export async function listArchivedCategories(tenantId: string, storeId: string) {
  return getDb().category.findMany({
    where: { tenantId, storeId, archivedAt: { not: null } },
    select: {
      id: true,
      name: true,
      description: true,
      archivedAt: true,
      archiveReason: true,
      archivedById: true,
      _count: { select: { products: true } },
    },
    orderBy: { archivedAt: 'desc' },
  });
}

/** Lista produtos arquivados de uma loja. */
export async function listArchivedProducts(tenantId: string, storeId: string) {
  return getDb().product.findMany({
    where: { tenantId, storeId, archivedAt: { not: null } },
    select: {
      id: true,
      name: true,
      basePrice: true,
      archivedAt: true,
      archiveReason: true,
      archivedById: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { archivedAt: 'desc' },
  });
}
