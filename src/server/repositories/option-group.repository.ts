import { getDb } from '@/server/database/client';
import type { Prisma } from '@prisma/client';

// =============================================================================
// ProductOptionGroup Repository
// =============================================================================

export async function listOptionGroups(productId: string) {
  return getDb().productOptionGroup.findMany({
    where: { productId, archivedAt: null },
    include: {
      options: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function findOptionGroupById(id: string) {
  return getDb().productOptionGroup.findUnique({
    where: { id },
    include: {
      options: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
      product: { select: { id: true, name: true, tenantId: true, storeId: true } },
    },
  });
}

export async function createOptionGroup(
  data: {
    productId: string;
    title: string;
    description?: string;
    isRequired?: boolean;
    isMultiple?: boolean;
    minSelections?: number;
    maxSelections?: number;
    isActive?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  // SortOrder automático
  const last = await db.productOptionGroup.findFirst({
    where: { productId: data.productId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1000 : 1000;

  return db.productOptionGroup.create({ data: { ...data, sortOrder } });
}

export async function updateOptionGroup(
  id: string,
  data: {
    title?: string;
    description?: string;
    isRequired?: boolean;
    isMultiple?: boolean;
    minSelections?: number;
    maxSelections?: number;
    sortOrder?: number;
    isActive?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.productOptionGroup.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
  });
}

/** Arquiva (soft-delete) um grupo de opções. */
export async function archiveOptionGroup(
  id: string,
  archivedById: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.productOptionGroup.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      archivedById,
      isActive: false,
      version: { increment: 1 },
    },
  });
}

/** Restaura um grupo arquivado. */
export async function restoreOptionGroup(id: string, productId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? getDb();

  const last = await db.productOptionGroup.findFirst({
    where: { productId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return db.productOptionGroup.update({
    where: { id },
    data: {
      archivedAt: null,
      archivedById: null,
      sortOrder: last ? last.sortOrder + 1000 : 1000,
      version: { increment: 1 },
    },
  });
}

/** Exclui definitivamente. */
export async function deleteOptionGroup(id: string) {
  return getDb().productOptionGroup.delete({ where: { id } });
}

// =============================================================================
// ProductOption
// =============================================================================

export async function createOption(
  data: {
    groupId: string;
    name: string;
    price?: number;
    isAvailable?: boolean;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();

  const last = await db.productOption.findFirst({
    where: { groupId: data.groupId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = last ? last.sortOrder + 1000 : 1000;

  return db.productOption.create({ data: { ...data, sortOrder } });
}

export async function updateOption(
  id: string,
  data: {
    name?: string;
    price?: number;
    isAvailable?: boolean;
    sortOrder?: number;
  },
  tx?: Prisma.TransactionClient,
) {
  const db = tx ?? getDb();
  return db.productOption.update({
    where: { id },
    data: { ...data, version: { increment: 1 } },
  });
}

/** Arquiva (soft-delete) uma opção. */
export async function archiveOption(id: string, archivedById: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? getDb();
  return db.productOption.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      archivedById,
      isAvailable: false,
      version: { increment: 1 },
    },
  });
}

/** Restaura uma opção arquivada. */
export async function restoreOption(id: string, groupId: string, tx?: Prisma.TransactionClient) {
  const db = tx ?? getDb();

  const last = await db.productOption.findFirst({
    where: { groupId, archivedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  return db.productOption.update({
    where: { id },
    data: {
      archivedAt: null,
      archivedById: null,
      isAvailable: true,
      sortOrder: last ? last.sortOrder + 1000 : 1000,
      version: { increment: 1 },
    },
  });
}

export async function deleteOption(id: string) {
  return getDb().productOption.delete({ where: { id } });
}

export async function findOptionById(id: string) {
  return getDb().productOption.findUnique({
    where: { id },
    select: {
      id: true,
      groupId: true,
      group: {
        select: {
          product: { select: { tenantId: true, storeId: true } },
        },
      },
    },
  });
}
