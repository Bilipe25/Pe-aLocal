import 'server-only';

import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { resolvePublicCustomization } from '@/features/customization/public';
import { CACHE_TAGS } from '@/server/cache';
import { getDb } from '@/server/database/client';
import { isInstallablePwaIconAsset } from '@/lib/pwa/manifest';

const PUBLIC_CACHE_SECONDS = 60;

const publicStorePwaSelect = {
  id: true,
  tenantId: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
  tenant: { select: { status: true } },
  settings: {
    select: {
      primaryColor: true,
      secondaryColor: true,
      fontFamily: true,
    },
  },
  customization: {
    // Drafts nunca fazem parte do contrato PWA público.
    select: {
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    },
  },
} as const;

export function toInstallableIconAssetId(asset: {
  id: string;
  mimeType: string;
  width: number;
  height: number;
}): string | null {
  return isInstallablePwaIconAsset(asset) ? asset.id : null;
}

async function getStorePwaFromDb(requestedSlug: string) {
  const db = getDb();
  let store = await db.store.findUnique({
    where: { slug: requestedSlug },
    select: publicStorePwaSelect,
  });

  if (!store) {
    const redirect = await db.storeSlugRedirect.findUnique({
      where: { oldSlug: requestedSlug },
      select: { store: { select: publicStorePwaSelect } },
    });
    store = redirect?.store ?? null;
  }

  if (!store || !store.isActive || store.tenant.status !== 'ACTIVE') return null;

  const customization = resolvePublicCustomization({
    publishedConfig: store.customization?.publishedConfig,
    publishedVersion: store.customization?.publishedVersion,
    publishedAt: store.customization?.publishedAt,
    legacy: {
      primaryColor: store.settings?.primaryColor,
      secondaryColor: store.settings?.secondaryColor,
      fontFamily: store.settings?.fontFamily,
    },
  });
  const preferredAssets = [
    { id: customization.config.identity.faviconAssetId, assetType: 'FAVICON' },
    { id: customization.config.identity.logoAssetId, assetType: 'LOGO' },
  ].filter((candidate): candidate is { id: string; assetType: 'FAVICON' | 'LOGO' } =>
    Boolean(candidate.id),
  );
  const preferredAssetIds = preferredAssets.map((candidate) => candidate.id);

  const assets = preferredAssetIds.length
    ? await db.storeAsset.findMany({
        where: {
          id: { in: preferredAssetIds },
          tenantId: store.tenantId,
          storeId: store.id,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true, assetType: true, mimeType: true, width: true, height: true },
      })
    : [];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const iconAssetId =
    preferredAssets
      .map((candidate) => {
        const asset = assetsById.get(candidate.id);
        return asset?.assetType === candidate.assetType ? asset : null;
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
      .map(toInstallableIconAssetId)
      .find((candidate): candidate is string => Boolean(candidate)) ?? null;

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    requestedSlug,
    description: store.description,
    config: customization.config,
    iconAssetId,
  };
}

const getCachedPublicStorePwa = (slug: string) =>
  unstable_cache(() => getStorePwaFromDb(slug), ['public-store-pwa', slug], {
    revalidate: PUBLIC_CACHE_SECONDS,
    tags: [CACHE_TAGS.storeSlug(slug)],
  })();

export const getPublicStorePwaBySlug = cache(getCachedPublicStorePwa);
