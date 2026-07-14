import { db } from '@/server/database/client';

// =============================================================================
// Category Repository
// =============================================================================

export async function listCategories(tenantId: string, storeId: string) {
  return db.category.findMany({
    where: { tenantId, storeId },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findCategoryById(id: string, tenantId: string) {
  return db.category.findFirst({
    where: { id, tenantId },
    include: {
      products: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, basePrice: true, isAvailable: true },
      },
    },
  });
}

export async function createCategory(data: {
  tenantId: string;
  storeId: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return db.category.create({ data });
}

export async function updateCategory(
  id: string,
  tenantId: string,
  data: {
    name?: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return db.category.updateMany({
    where: { id, tenantId },
    data,
  });
}

export async function deleteCategory(id: string, tenantId: string) {
  return db.category.deleteMany({
    where: { id, tenantId },
  });
}
