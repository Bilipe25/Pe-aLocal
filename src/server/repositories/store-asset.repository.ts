import { Prisma, type StoreAssetType } from '@prisma/client';

import { getDb } from '@/server/database/client';

const assetSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  assetType: true,
  objectKey: true,
  mimeType: true,
  width: true,
  height: true,
  sizeBytes: true,
  altText: true,
  status: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.StoreAssetSelect;

export function listActiveStoreAssets(tenantId: string, storeId: string) {
  return getDb().storeAsset.findMany({
    where: { tenantId, storeId, status: 'ACTIVE', deletedAt: null },
    orderBy: [{ assetType: 'asc' }, { createdAt: 'desc' }],
    select: assetSelect,
  });
}

export function findScopedStoreAsset(tenantId: string, storeId: string, assetId: string) {
  return getDb().storeAsset.findFirst({
    where: { id: assetId, tenantId, storeId },
    select: assetSelect,
  });
}

export function findPublicStoreAsset(assetId: string) {
  return getDb().storeAsset.findFirst({
    where: {
      id: assetId,
      status: 'ACTIVE',
      deletedAt: null,
      store: { isActive: true, tenant: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      storeId: true,
      objectKey: true,
      mimeType: true,
      width: true,
      height: true,
      sizeBytes: true,
    },
  });
}

export async function isStoreAssetReferenced(
  tenantId: string,
  storeId: string,
  assetId: string,
): Promise<boolean> {
  const pattern = `%${assetId}%`;
  const rows = await getDb().$queryRaw<{ referenced: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "store_customizations" customization
      WHERE customization."tenantId" = ${tenantId}
        AND customization."storeId" = ${storeId}
        AND (
          customization."publishedConfig"::text LIKE ${pattern}
          OR customization."draftConfig"::text LIKE ${pattern}
        )
      UNION ALL
      SELECT 1
      FROM "store_customization_revisions" revision
      WHERE revision."tenantId" = ${tenantId}
        AND revision."storeId" = ${storeId}
        AND revision."snapshot"::text LIKE ${pattern}
    ) AS "referenced"
  `);
  return rows[0]?.referenced ?? false;
}

export function listGarbageCollectableAssets(before: Date, take: number) {
  return getDb().storeAsset.findMany({
    where: { status: 'DELETED', deletedAt: { lte: before } },
    orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
    take,
    select: { id: true, tenantId: true, storeId: true, objectKey: true },
  });
}

export function hardDeleteStoreAsset(assetId: string) {
  return getDb().storeAsset.deleteMany({ where: { id: assetId, status: 'DELETED' } });
}

export type StoreAssetCreateInput = {
  id: string;
  tenantId: string;
  storeId: string;
  assetType: StoreAssetType;
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  altText: string;
  createdById: string;
};

export { assetSelect };
