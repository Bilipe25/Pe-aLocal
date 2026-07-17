import { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';

export const bannerSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  assetId: true,
  title: true,
  subtitle: true,
  buttonText: true,
  destinationType: true,
  destinationValue: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  asset: {
    select: {
      id: true,
      assetType: true,
      altText: true,
      status: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.StoreBannerSelect;

export function listAdminStoreBanners(tenantId: string, storeId: string) {
  return getDb().storeBanner.findMany({
    where: { tenantId, storeId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    select: bannerSelect,
  });
}

export function findScopedStoreBanner(tenantId: string, storeId: string, bannerId: string) {
  return getDb().storeBanner.findFirst({
    where: { id: bannerId, tenantId, storeId },
    select: bannerSelect,
  });
}

export function listPublicStoreBanners(tenantId: string, storeId: string, now: Date) {
  return getDb().storeBanner.findMany({
    where: {
      tenantId,
      storeId,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
      OR: [{ assetId: null }, { asset: { status: 'ACTIVE', deletedAt: null } }],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 3,
    select: {
      id: true,
      title: true,
      subtitle: true,
      buttonText: true,
      destinationType: true,
      destinationValue: true,
      priority: true,
      asset: { select: { id: true, altText: true } },
    },
  });
}
