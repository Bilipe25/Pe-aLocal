import 'server-only';

import { getStoreAssetRuntime } from '@/server/storage/store-assets';

export const STORE_ASSET_ALLOWED_WIDTHS = new Set([96, 192, 384, 768, 1280]);

interface StoredAsset {
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
}

type OutputFormat = 'image/avif' | 'image/webp';

const FORMAT_QUALITY: Record<OutputFormat, number> = {
  'image/avif': 56,
  'image/webp': 82,
};

function responseHeaders(input: {
  contentType: string;
  etag: string;
  cacheControl: string;
  width?: number;
  height?: number;
  vary?: boolean;
}) {
  const headers = new Headers({
    'Content-Type': input.contentType,
    'Cache-Control': input.cacheControl,
    ETag: input.etag,
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  });
  if (input.width) headers.set('X-Image-Width', String(input.width));
  if (input.height) headers.set('X-Image-Height', String(input.height));
  if (input.vary) headers.set('Vary', 'Accept');
  return headers;
}

function normalizeR2Etag(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function resolveOutputFormat(request: Request): OutputFormat {
  const accept = request.headers.get('accept') ?? '';
  if (accept.includes('image/avif')) return 'image/avif';
  return 'image/webp';
}

export async function serveStoreAsset(request: Request, asset: StoredAsset, cacheControl: string) {
  const requestedWidth = Number(new URL(request.url).searchParams.get('width') ?? 0);
  if (requestedWidth !== 0 && !STORE_ASSET_ALLOWED_WIDTHS.has(requestedWidth)) {
    return new Response('Largura de imagem não suportada.', { status: 400 });
  }
  const width = requestedWidth !== 0 ? requestedWidth : undefined;
  const runtime = await getStoreAssetRuntime();
  const object = await runtime.bucket.get(asset.objectKey);
  if (!object || !('body' in object)) return new Response('Asset não encontrado.', { status: 404 });

  if (width) {
    const format = resolveOutputFormat(request);
    const quality = FORMAT_QUALITY[format];
    const baseEtag = normalizeR2Etag(object.httpEtag ?? object.etag);
    const etag = `"${baseEtag}-w${width}-${format}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, Vary: 'Accept' } });
    }

    const transformed = await runtime.images
      .input(object.body)
      .transform({ width, fit: 'scale-down' })
      .output({ format, quality });
    const transformedResponse = transformed.response();
    return new Response(transformedResponse.body, {
      headers: responseHeaders({
        contentType: format,
        cacheControl,
        etag,
        width,
        vary: true,
      }),
    });
  }

  const headers = responseHeaders({
    contentType: asset.mimeType,
    cacheControl,
    etag: object.httpEtag,
    width: asset.width,
    height: asset.height,
  });
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}