import type { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export const couponAdminSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  code: true,
  type: true,
  value: true,
  minOrderValue: true,
  maxDiscount: true,
  maxUsages: true,
  usageCount: true,
  isActive: true,
  startsAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CouponSelect;

const scopedCouponSelect = {
  ...couponAdminSelect,
  _count: { select: { usages: true } },
} satisfies Prisma.CouponSelect;

export type CouponAdminRecord = Prisma.CouponGetPayload<{
  select: typeof couponAdminSelect;
}>;

type CouponClient = Pick<Prisma.TransactionClient, 'coupon'>;

export function listScopedCoupons(
  tenantId: string,
  storeId: string,
  options: { skip: number; take: number },
) {
  return getDb().coupon.findMany({
    where: { tenantId, storeId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    skip: options.skip,
    take: options.take,
    select: couponAdminSelect,
  });
}

export function countScopedCoupons(tenantId: string, storeId: string) {
  return getDb().coupon.count({ where: { tenantId, storeId } });
}

export function findScopedCoupon(
  client: CouponClient,
  tenantId: string,
  storeId: string,
  couponId: string,
) {
  return client.coupon.findFirst({
    where: { id: couponId, tenantId, storeId },
    select: scopedCouponSelect,
  });
}

export function findScopedCouponByCode(
  client: CouponClient,
  tenantId: string,
  storeId: string,
  code: string,
  excludeCouponId?: string,
) {
  return client.coupon.findFirst({
    where: {
      tenantId,
      storeId,
      code: { equals: code, mode: 'insensitive' },
      ...(excludeCouponId ? { id: { not: excludeCouponId } } : {}),
    },
    select: { id: true },
  });
}

export function createScopedCoupon(client: CouponClient, data: Prisma.CouponUncheckedCreateInput) {
  return client.coupon.create({
    data,
    select: couponAdminSelect,
  });
}

export function updateScopedCoupon(
  client: CouponClient,
  couponId: string,
  data: Prisma.CouponUncheckedUpdateInput,
) {
  return client.coupon.update({
    where: { id: couponId },
    data,
    select: couponAdminSelect,
  });
}

export function deleteScopedCoupon(client: CouponClient, couponId: string) {
  return client.coupon.delete({
    where: { id: couponId },
    select: { id: true },
  });
}
