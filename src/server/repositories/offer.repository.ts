import type { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export const comboAdminSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  description: true,
  specialPrice: true,
  isActive: true,
  sortOrder: true,
  version: true,
  startsOn: true,
  endsOnExclusive: true,
  weekdays: true,
  startMinute: true,
  endMinuteExclusive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      productId: true,
      quantity: true,
      position: true,
      product: {
        select: {
          id: true,
          name: true,
          basePrice: true,
          isAvailable: true,
          isSoldOut: true,
          archivedAt: true,
          imageUrl: true,
          imageAssetId: true,
          version: true,
        },
      },
    },
  },
} satisfies Prisma.StoreComboSelect;

export const promotionAdminSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  productId: true,
  promotionalPrice: true,
  isActive: true,
  version: true,
  startsOn: true,
  endsOnExclusive: true,
  weekdays: true,
  startMinute: true,
  endMinuteExclusive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      basePrice: true,
      isAvailable: true,
      isSoldOut: true,
      archivedAt: true,
      imageUrl: true,
      imageAssetId: true,
      version: true,
    },
  },
} satisfies Prisma.StoreProductPromotionSelect;

export type ComboAdminRecord = Prisma.StoreComboGetPayload<{ select: typeof comboAdminSelect }>;
export type PromotionAdminRecord = Prisma.StoreProductPromotionGetPayload<{
  select: typeof promotionAdminSelect;
}>;

type OfferClient = Pick<
  Prisma.TransactionClient,
  'storeCombo' | 'storeComboItem' | 'storeProductPromotion' | 'product' | '$queryRaw'
>;

export function listScopedCombos(
  tenantId: string,
  storeId: string,
  where: Prisma.StoreComboWhereInput,
  take: number,
) {
  return getDb().storeCombo.findMany({
    where: { tenantId, storeId, ...where },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take,
    select: comboAdminSelect,
  });
}

export function listScopedPromotions(
  tenantId: string,
  storeId: string,
  where: Prisma.StoreProductPromotionWhereInput,
  take: number,
) {
  return getDb().storeProductPromotion.findMany({
    where: { tenantId, storeId, ...where },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take,
    select: promotionAdminSelect,
  });
}

export function countScopedCombos(
  tenantId: string,
  storeId: string,
  where: Prisma.StoreComboWhereInput,
) {
  return getDb().storeCombo.count({ where: { tenantId, storeId, ...where } });
}

export function countScopedPromotions(
  tenantId: string,
  storeId: string,
  where: Prisma.StoreProductPromotionWhereInput,
) {
  return getDb().storeProductPromotion.count({ where: { tenantId, storeId, ...where } });
}

export function findScopedCombo(
  client: OfferClient,
  tenantId: string,
  storeId: string,
  id: string,
) {
  return client.storeCombo.findFirst({
    where: { id, tenantId, storeId },
    select: comboAdminSelect,
  });
}

export function findScopedPromotion(
  client: OfferClient,
  tenantId: string,
  storeId: string,
  id: string,
) {
  return client.storeProductPromotion.findFirst({
    where: { id, tenantId, storeId },
    select: promotionAdminSelect,
  });
}

export function findScopedProducts(
  client: OfferClient,
  tenantId: string,
  storeId: string,
  productIds: string[],
) {
  return client.product.findMany({
    where: { id: { in: productIds }, tenantId, storeId },
    select: {
      id: true,
      name: true,
      basePrice: true,
      isAvailable: true,
      isSoldOut: true,
      archivedAt: true,
      version: true,
    },
  });
}

export function createScopedCombo(
  client: OfferClient,
  data: Prisma.StoreComboUncheckedCreateInput,
) {
  return client.storeCombo.create({ data, select: comboAdminSelect });
}

export async function replaceScopedCombo(
  client: OfferClient,
  comboId: string,
  data: Prisma.StoreComboUncheckedUpdateInput,
  items: Prisma.StoreComboItemCreateManyComboInput[],
) {
  await client.storeComboItem.deleteMany({ where: { comboId } });
  return client.storeCombo.update({
    where: { id: comboId },
    data: {
      ...data,
      items: { createMany: { data: items } },
      version: { increment: 1 },
    },
    select: comboAdminSelect,
  });
}

export function createScopedPromotion(
  client: OfferClient,
  data: Prisma.StoreProductPromotionUncheckedCreateInput,
) {
  return client.storeProductPromotion.create({ data, select: promotionAdminSelect });
}

export function updateScopedPromotion(
  client: OfferClient,
  promotionId: string,
  data: Prisma.StoreProductPromotionUncheckedUpdateInput,
) {
  return client.storeProductPromotion.update({
    where: { id: promotionId },
    data: { ...data, version: { increment: 1 } },
    select: promotionAdminSelect,
  });
}

export function listConflictingPromotionSchedules(
  client: OfferClient,
  tenantId: string,
  storeId: string,
  productId: string,
  excludeId?: string,
) {
  return client.storeProductPromotion.findMany({
    where: {
      tenantId,
      storeId,
      productId,
      isActive: true,
      archivedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: promotionAdminSelect,
  });
}

export async function lockPromotionProduct(
  client: OfferClient,
  storeId: string,
  productId: string,
) {
  await client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${storeId}:${productId}`}, 0))`;
}
