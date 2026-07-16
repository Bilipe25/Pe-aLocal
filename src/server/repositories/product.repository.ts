import { getDb } from '@/server/database/client';

// =============================================================================
// Product Repository
// =============================================================================

export async function listProducts(tenantId: string, storeId: string) {
  return getDb().product.findMany({
    where: { tenantId, storeId },
    include: {
      category: { select: { id: true, name: true } },
      _count: { select: { optionGroups: true } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });
}

export async function listProductsByCategory(categoryId: string, tenantId: string) {
  return getDb().product.findMany({
    where: { categoryId, tenantId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findProductById(id: string, tenantId: string) {
  return getDb().product.findFirst({
    where: { id, tenantId },
    include: {
      category: { select: { id: true, name: true } },
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        include: {
          options: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });
}

export async function createProduct(data: {
  tenantId: string;
  storeId: string;
  categoryId: string;
  name: string;
  description?: string;
  basePrice: number;
  isAvailable?: boolean;
  isFeatured?: boolean;
  allowNotes?: boolean;
  sortOrder?: number;
}) {
  return getDb().product.create({ data });
}

export async function updateProduct(
  id: string,
  tenantId: string,
  data: {
    categoryId?: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    basePrice?: number;
    isAvailable?: boolean;
    isFeatured?: boolean;
    isSoldOut?: boolean;
    allowNotes?: boolean;
    sortOrder?: number;
  },
) {
  return getDb().product.updateMany({
    where: { id, tenantId },
    data,
  });
}

export async function deleteProduct(id: string, tenantId: string) {
  return getDb().product.deleteMany({
    where: { id, tenantId },
  });
}
