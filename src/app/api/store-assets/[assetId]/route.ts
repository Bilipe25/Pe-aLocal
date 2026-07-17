import { unstable_cache } from 'next/cache';

import { getStoreAssetRuntime } from '@/server/storage/store-assets';
import { CACHE_TAGS } from '@/server/cache';
import * as assetRepo from '@/server/repositories/store-asset.repository';

const ALLOWED_WIDTHS = new Set([96, 192, 384, 768, 1280]);

async function getCachedPublicAsset(assetId: string) {
  return unstable_cache(
    () => assetRepo.findPublicStoreAsset(assetId),
    ['public-store-asset', assetId],
    { revalidate: 300, tags: [CACHE_TAGS.asset(assetId)] },
  )();
}

function responseHeaders(input: {
  contentType: string;
  etag: string;
  width?: number;
  height?: number;
}) {
  const headers = new Headers({
    'Content-Type': input.contentType,
    'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
    ETag: input.etag,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  });
  if (input.width) headers.set('X-Image-Width', String(input.width));
  if (input.height) headers.set('X-Image-Height', String(input.height));
  return headers;
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await getCachedPublicAsset(assetId);
  if (!asset) return new Response('Asset não encontrado.', { status: 404 });

  const requestedWidth = Number(new URL(request.url).searchParams.get('width') ?? 0);
  const width = ALLOWED_WIDTHS.has(requestedWidth) ? requestedWidth : undefined;
  const runtime = await getStoreAssetRuntime();
  const object = await runtime.bucket.get(asset.objectKey);
  if (!object || !('body' in object)) return new Response('Asset não encontrado.', { status: 404 });

  const etag = width ? `"${object.etag}-w${width}"` : object.httpEtag;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  if (width) {
    const transformed = await runtime.images
      .input(object.body)
      .transform({ width, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 82 });
    const transformedResponse = transformed.response();
    return new Response(transformedResponse.body, {
      headers: responseHeaders({ contentType: 'image/webp', etag, width }),
    });
  }

  const headers = responseHeaders({
    contentType: asset.mimeType,
    etag,
    width: asset.width,
    height: asset.height,
  });
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}
