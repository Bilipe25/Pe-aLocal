import 'server-only';

import { getStoreAssetReadRuntime } from '@/server/storage/store-assets';

export const STORE_ASSET_ALLOWED_WIDTHS = new Set([96, 192, 384, 768, 1280]);

interface StoredAsset {
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
}

type OutputFormat = 'image/avif' | 'image/webp';

const PWA_VARIANTS = {
  'pwa-apple-180': { width: 180, height: 180, maskable: false },
  'pwa-any-192': { width: 192, height: 192, maskable: false },
  'pwa-any-512': { width: 512, height: 512, maskable: false },
  'pwa-maskable-512': { width: 512, height: 512, maskable: true },
} as const;

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
  const requestUrl = new URL(request.url);
  const variantName = requestUrl.searchParams.get('variant');
  const requestedBackground = requestUrl.searchParams.get('background')?.toUpperCase();
  const maskableBackground =
    requestedBackground && /^#[0-9A-F]{6}$/.test(requestedBackground)
      ? requestedBackground
      : '#FFFFFF';
  const pwaVariant =
    variantName && variantName in PWA_VARIANTS
      ? PWA_VARIANTS[variantName as keyof typeof PWA_VARIANTS]
      : null;
  if (variantName && !pwaVariant) {
    return new Response('Variante de imagem não suportada.', { status: 400 });
  }
  const requestedWidth = Number(requestUrl.searchParams.get('width') ?? 0);
  if (requestedWidth !== 0 && !STORE_ASSET_ALLOWED_WIDTHS.has(requestedWidth)) {
    return new Response('Largura de imagem não suportada.', { status: 400 });
  }
  const width = requestedWidth !== 0 ? requestedWidth : undefined;
  const runtime = await getStoreAssetReadRuntime();
  const object = await runtime.bucket.get(asset.objectKey);
  if (!object || !('body' in object)) return new Response('Asset não encontrado.', { status: 404 });

  if (pwaVariant && runtime.images) {
    const baseEtag = normalizeR2Etag(object.httpEtag ?? object.etag);
    const etag = `"${baseEtag}-${variantName}-${pwaVariant.maskable ? maskableBackground.slice(1) : 'default'}-png"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    try {
      let transformer = runtime.images.input(object.body);
      if (pwaVariant.maskable) {
        const safeSize = Math.round(pwaVariant.width * 0.8);
        const border = Math.floor((pwaVariant.width - safeSize) / 2);
        transformer = transformer
          .transform({ width: safeSize, height: safeSize, fit: 'contain' })
          .transform({ border: { color: maskableBackground, width: border } });
      } else {
        transformer = transformer.transform({
          width: pwaVariant.width,
          height: pwaVariant.height,
          fit: 'cover',
          gravity: 'center',
        });
      }
      const transformed = await transformer.output({ format: 'image/png' });
      const transformedResponse = transformed.response();
      return new Response(transformedResponse.body, {
        headers: responseHeaders({
          contentType: 'image/png',
          cacheControl,
          etag,
          width: pwaVariant.width,
          height: pwaVariant.height,
        }),
      });
    } catch {
      return new Response('Não foi possível gerar o ícone instalável.', {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
  }

  if (pwaVariant) {
    return new Response('Transformação de imagem temporariamente indisponível.', {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (width && runtime.images) {
    const format = resolveOutputFormat(request);
    const quality = FORMAT_QUALITY[format];
    const baseEtag = normalizeR2Etag(object.httpEtag ?? object.etag);
    const etag = `"${baseEtag}-w${width}-${format}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, Vary: 'Accept' } });
    }

    try {
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
    } catch {
      // A transformação é uma otimização, não uma condição para a imagem
      // existir. Como o stream pode ter sido consumido, buscamos o objeto de
      // novo e entregamos o original com cache seguro.
      const fallbackObject = await runtime.bucket.get(asset.objectKey);
      if (!fallbackObject || !('body' in fallbackObject)) {
        return new Response('Asset não encontrado.', { status: 404 });
      }
      const headers = responseHeaders({
        contentType: asset.mimeType,
        cacheControl,
        etag: fallbackObject.httpEtag,
        width: asset.width,
        height: asset.height,
      });
      headers.set('Content-Length', String(fallbackObject.size));
      headers.set('X-Image-Fallback', 'original');
      return new Response(fallbackObject.body, { headers });
    }
  }

  const headers = responseHeaders({
    contentType: asset.mimeType,
    cacheControl,
    etag: object.httpEtag,
    width: asset.width,
    height: asset.height,
  });
  headers.set('Content-Length', String(object.size));
  if (width && !runtime.images) headers.set('X-Image-Fallback', 'original');
  return new Response(object.body, { headers });
}
