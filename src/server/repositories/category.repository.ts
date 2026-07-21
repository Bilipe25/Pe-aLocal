import { getDb } from '@/server/database/client';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Category Repository
// =============================================================================

/** Lista categorias ativas (não arquivadas) de uma loja. */
export async function listCategories(tenantId: string, storeId: string) {
  return getDb().category.findMany({
    where: { tenantId, storeId, archivedAt: null },
    include: {
      _count: { select: { products: { where: { archivedAt: null } } } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Lista TODAS as categorias (incluindo arquivadas) para a área admin. */
export async function listAllCategories(
  tenantId: string,
  storeId: string,
  options: { includeArchived?: boolean } = {},
) {
  return getDb().category.findMany({
    where: {
      tenantId,
      storeId,
      archivedAt: options.includeArchived ? undefined : null,
    },
    include: {
      _count: { select: { products: { where: { archivedAt: null } } } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function findCategoryById(id: string, tenantId: string) {
  return getDb().category.findFirst({
    where: { id, tenantId },
    include: {
      products: {
        where: { archivedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, basePrice: true, isAvailable: true },
      },
    },
  });
}

/** Cria uma categoria com sortOrder automático (após o último existente). */
export async function createCategory(
  data: {
    tenantId: string;
    storeId: string;
    name: string;
    description?: string;
    isActive?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  // Calcula a próxima posição (espaçamento de 1000)
  const last = await db.category.findFirst({
    where: { tenantId: data.tenantId, storeId: data.storeId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1000 : 1000;

  return db.category.create({ data: { ...data, sortOrder } });
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
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.category.updateMany({
    where: { id, tenantId },
    data: { ...data, version: { increment: 1 } },
  });
}

/** Atualização com controle de concorrência otimista. */
export async function updateCategoryWithVersion(
  id: string,
  tenantId: string,
  expectedVersion: number,
  data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  const result = await db.category.updateMany({
    where: { id, tenantId, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  return result.count; // 0 = conflito de versão
}

/** Arquiva (soft-delete) uma categoria. */
export async function archiveCategory(
  id: string,
  tenantId: string,
  archivedById: string,
  archiveReason?: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.category.updateMany({
    where: { id, tenantId, archivedAt: null },
    data: {
      archivedAt: new Date(),
      archivedById,
      archiveReason: archiveReason ?? null,
      version: { increment: 1 },
    },
  });
}

/** Restaura uma categoria arquivada. */
export async function restoreCategory(
  id: string,
  tenantId: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  // Recalcula sortOrder para evitar conflito com posições existentes
  const last = await db.category.findFirst({
    where: { tenantId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true, storeId: true },
  });

  return db.category.updateMany({
    where: { id, tenantId },
    data: {
      archivedAt: null,
      archivedById: null,
      archiveReason: null,
      sortOrder: last ? last.sortOrder + 1000 : 1000,
      version: { increment: 1 },
    },
  });
}

/** Exclui definitivamente — apenas para registros nunca utilizados. */
export async function deleteCategory(id: string, tenantId: string) {
  return getDb().category.deleteMany({
    where: { id, tenantId },
  });
}
