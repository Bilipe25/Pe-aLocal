import type { PrismaClient } from '@prisma/client';

import { createCustomizationFromLegacy } from '@/features/customization/domain/defaults';
import { migrateCustomizationToCurrentVersion } from '@/features/customization/domain/migrations';
import { isInstallablePwaIconAsset } from '@/lib/pwa/manifest';

export async function resolveWebPushStoreIdentity(
  db: PrismaClient,
  tenantId: string,
  storeId: string,
) {
  const store = await db.store.findFirst({
    where: { id: storeId, tenantId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      settings: { select: { primaryColor: true, secondaryColor: true, fontFamily: true } },
      customization: { select: { publishedConfig: true } },
    },
  });
  if (!store) return null;

  let customization;
  try {
    customization = migrateCustomizationToCurrentVersion(store.customization?.publishedConfig);
  } catch {
    customization = createCustomizationFromLegacy({
      primaryColor: store.settings?.primaryColor,
      secondaryColor: store.settings?.secondaryColor,
      fontFamily: store.settings?.fontFamily,
    });
  }

  for (const candidate of [
    { id: customization.identity.faviconAssetId, assetType: 'FAVICON' as const },
    { id: customization.identity.logoAssetId, assetType: 'LOGO' as const },
  ]) {
    if (!candidate.id) continue;
    const asset = await db.storeAsset.findFirst({
      where: {
        id: candidate.id,
        tenantId,
        storeId,
        assetType: candidate.assetType,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, mimeType: true, width: true, height: true },
    });
    if (asset && isInstallablePwaIconAsset(asset)) {
      return { ...store, iconAssetId: asset.id };
    }
  }
  return { ...store, iconAssetId: null };
}
