import { getDb } from '@/server/database/client';

// =============================================================================
// ProductOptionGroup Repository
// =============================================================================

export async function listOptionGroups(productId: string) {
  return getDb().productOptionGroup.findMany({
    where: { productId },
    include: {
      options: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function findOptionGroupById(id: string) {
  return getDb().productOptionGroup.findUnique({
    where: { id },
    include: {
      options: { orderBy: { sortOrder: 'asc' } },
      product: { select: { id: true, name: true, tenantId: true, storeId: true } },
    },
  });
}

export async function createOptionGroup(data: {
  productId: string;
  title: string;
  description?: string;
  isRequired?: boolean;
  isMultiple?: boolean;
  minSelections?: number;
  maxSelections?: number;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return getDb().productOptionGroup.create({ data });
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
) {
  return getDb().productOptionGroup.update({
    where: { id },
    data,
  });
}

export async function deleteOptionGroup(id: string) {
  return getDb().productOptionGroup.delete({ where: { id } });
}

// === Options ===

export async function createOption(data: {
  groupId: string;
  name: string;
  price?: number;
  isAvailable?: boolean;
  sortOrder?: number;
}) {
  return getDb().productOption.create({ data });
}

export async function updateOption(
  id: string,
  data: {
    name?: string;
    price?: number;
    isAvailable?: boolean;
    sortOrder?: number;
  },
) {
  return getDb().productOption.update({ where: { id }, data });
}

export async function deleteOption(id: string) {
  return getDb().productOption.delete({ where: { id } });
}

export async function findOptionById(id: string) {
  return getDb().productOption.findUnique({
    where: { id },
    select: {
      id: true,
      group: {
        select: {
          product: { select: { tenantId: true, storeId: true } },
        },
      },
    },
  });
}
