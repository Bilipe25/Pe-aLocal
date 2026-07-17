import { Prisma } from '@prisma/client';

import { LAYOUT_TEMPLATES, VISUAL_PRESETS } from '@/schemas/customization';
import { getDb } from '@/server/database/client';

export const DEFAULT_STORE_ENTITLEMENT = {
  maxAssetCount: 25,
  maxAssetStorageBytes: 50 * 1024 * 1024,
  maxBanners: 5,
  allowedLayoutTemplates: [...LAYOUT_TEMPLATES],
  allowedVisualPresets: [...VISUAL_PRESETS],
  advancedTypographyEnabled: true,
  customDomainEnabled: false,
  platformBrandingRemovalEnabled: false,
  scheduledBannersEnabled: false,
};

export const entitlementSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  maxAssetCount: true,
  maxAssetStorageBytes: true,
  maxBanners: true,
  allowedLayoutTemplates: true,
  allowedVisualPresets: true,
  advancedTypographyEnabled: true,
  customDomainEnabled: true,
  platformBrandingRemovalEnabled: true,
  scheduledBannersEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreEntitlementSelect;

export function ensureStoreEntitlement(tenantId: string, storeId: string) {
  return getDb().storeEntitlement.upsert({
    where: { storeId },
    create: { tenantId, storeId, ...DEFAULT_STORE_ENTITLEMENT },
    update: {},
    select: entitlementSelect,
  });
}

export async function lockStoreEntitlement(
  tx: Prisma.TransactionClient,
  tenantId: string,
  storeId: string,
) {
  const rows = await tx.$queryRaw<
    {
      id: string;
      maxAssetCount: number;
      maxAssetStorageBytes: number;
      maxBanners: number;
      scheduledBannersEnabled: boolean;
    }[]
  >(Prisma.sql`
    SELECT
      "id",
      "maxAssetCount",
      "maxAssetStorageBytes",
      "maxBanners",
      "scheduledBannersEnabled"
    FROM "store_entitlements"
    WHERE "tenantId" = ${tenantId} AND "storeId" = ${storeId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}
