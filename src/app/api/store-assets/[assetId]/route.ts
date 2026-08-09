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

function developmentFailureCode(error: unknown) {
  if (process.env.NODE_ENV === 'production') return null;
  if (error instanceof Error) {
    if (error.message.includes('STORE_ASSETS_R2')) return 'missing-r2-binding';
    if (error.message.includes('initOpenNextCloudflareForDev')) return 'cloudflare-context';
    if (error.message.includes('local Postgres connection string')) {
      return 'hyperdrive-local-connection';
    }
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return `runtime-${error.code.toLowerCase()}`;
  }
  return 'runtime-unavailable';
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await params;
    const asset = await getCachedPublicAsset(assetId);
    if (!asset) return new Response('Asset não encontrado.', { status: 404 });
    return await serveStoreAsset(
      request,
      asset,
      'public, max-age=86400, s-maxage=31536000, immutable',
    );
  } catch (error) {
    const failureCode = developmentFailureCode(error);
    return new Response('Imagem temporariamente indisponível.', {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        ...(failureCode ? { 'X-Store-Asset-Failure': failureCode } : {}),
      },
    });
  }
}
