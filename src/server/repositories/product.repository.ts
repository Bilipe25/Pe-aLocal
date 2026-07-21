import { getDb } from '@/server/database/client';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Product Repository
// =============================================================================

/** Seleção mínima para listagem do catálogo admin (sem dados sensíveis). */
const productSummarySelect = {
  id: true,
  tenantId: true,
  storeId: true,
  categoryId: true,
  name: true,
  imageUrl: true,
  imageAssetId: true,
  basePrice: true,
  isAvailable: true,
  isFeatured: true,
  isSoldOut: true,
  allowNotes: true,
  sortOrder: true,
  version: true,
  archivedAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  _count: { select: { optionGroups: { where: { archivedAt: null } } } },
} satisfies Prisma.ProductSelect;

/** Lista produtos ativos (não arquivados) de uma loja. */
export async function listProducts(tenantId: string, storeId: string) {
  return getDb().product.findMany({
    where: { tenantId, storeId, archivedAt: null },
    select: productSummarySelect,
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });
}

export async function listProductsByCategory(
  categoryId: string,
  tenantId: string,
  options: { includeArchived?: boolean } = {},
) {
  return getDb().product.findMany({
    where: {
      categoryId,
      tenantId,
      archivedAt: options.includeArchived ? undefined : null,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function findProductById(id: string, tenantId: string) {
  return getDb().product.findFirst({
    where: { id, tenantId },
    include: {
      category: { select: { id: true, name: true, isActive: true } },
      optionGroups: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          options: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  });
}

/** Cria produto com sortOrder automático dentro da categoria. */
export async function createProduct(
  data: {
    tenantId: string;
    storeId: string;
    categoryId: string;
    name: string;
    description?: string;
    basePrice: number;
    isAvailable?: boolean;
    isFeatured?: boolean;
    allowNotes?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  const last = await db.product.findFirst({
    where: { tenantId: data.tenantId, categoryId: data.categoryId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1000 : 1000;

  return db.product.create({ data: { ...data, sortOrder } });
}

export async function updateProduct(
  id: string,
  tenantId: string,
  data: {
    categoryId?: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    imageAssetId?: string | null;
    basePrice?: number;
    isAvailable?: boolean;
    isFeatured?: boolean;
    isSoldOut?: boolean;
    allowNotes?: boolean;
    sortOrder?: number;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.product.updateMany({
    where: { id, tenantId },
    data: { ...data, version: { increment: 1 } },
  });
}

/** Atualização com controle de concorrência otimista. */
export async function updateProductWithVersion(
  id: string,
  tenantId: string,
  expectedVersion: number,
  data: {
    categoryId?: string;
    name?: string;
    description?: string;
    basePrice?: number;
    isAvailable?: boolean;
    isFeatured?: boolean;
    isSoldOut?: boolean;
    allowNotes?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  const result = await db.product.updateMany({
    where: { id, tenantId, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  return result.count; // 0 = conflito
}

/** Atualiza disponibilidade (sem concorrência — operação rápida de Attendant). */
export async function setProductAvailability(
  id: string,
  tenantId: string,
  data: { isAvailable?: boolean; isSoldOut?: boolean },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.product.updateMany({
    where: { id, tenantId, archivedAt: null },
    data: { ...data, version: { increment: 1 } },
  });
}

/** Arquiva (soft-delete) um produto. */
export async function archiveProduct(
  id: string,
  tenantId: string,
  archivedById: string,
  archiveReason?: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.product.updateMany({
    where: { id, tenantId, archivedAt: null },
    data: {
      archivedAt: new Date(),
      archivedById,
      archiveReason: archiveReason ?? null,
      isAvailable: false,
      version: { increment: 1 },
    },
  });
}

/** Restaura um produto arquivado. */
export async function restoreProduct(
  id: string,
  tenantId: string,
  categoryId: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  const last = await db.product.findFirst({
    where: { tenantId, categoryId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return db.product.updateMany({
    where: { id, tenantId },
    data: {
      archivedAt: null,
      archivedById: null,
      archiveReason: null,
      isAvailable: false, // Restaura como indisponível para revisão
      sortOrder: last ? last.sortOrder + 1000 : 1000,
      version: { increment: 1 },
    },
  });
}

/** Exclui definitivamente — apenas para registros nunca utilizados. */
export async function deleteProduct(id: string, tenantId: string) {
  return getDb().product.deleteMany({
    where: { id, tenantId },
  });
}
