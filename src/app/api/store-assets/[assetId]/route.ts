import { unstable_cache } from 'next/cache';

import { CACHE_TAGS } from '@/server/cache';
import * as assetRepo from '@/server/repositories/store-asset.repository';
import { serveStoreAsset } from '@/server/storage/store-asset-response';

async function getCachedPublicAsset(assetId: string) {
  return unstable_cache(
    () => assetRepo.findPublicStoreAsset(assetId),
    ['public-store-asset', assetId],
    { revalidate: 300, tags: [CACHE_TAGS.asset(assetId)] },
  )();
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await getCachedPublicAsset(assetId);
  if (!asset) return new Response('Asset não encontrado.', { status: 404 });
  return serveStoreAsset(request, asset, 'public, max-age=86400, s-maxage=31536000, immutable');
}
