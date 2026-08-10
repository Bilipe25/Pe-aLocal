import { buildStoreManifest } from '@/lib/pwa/manifest';
import { getPublicStorePwaBySlug } from '@/server/queries/public-store-pwa';

interface RouteContext {
  params: Promise<{ storeSlug: string }>;
}

const MANIFEST_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=60, must-revalidate',
  'Content-Type': 'application/manifest+json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request, { params }: RouteContext): Promise<Response> {
  const { storeSlug } = await params;
  const store = await getPublicStorePwaBySlug(storeSlug);

  if (!store) {
    return Response.json(
      { error: 'Loja não encontrada.' },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  }

  if (store.slug !== storeSlug) {
    const canonicalUrl = new URL(request.url);
    canonicalUrl.pathname = `/${encodeURIComponent(store.slug)}/manifest.webmanifest`;
    return Response.redirect(canonicalUrl, 308);
  }

  return new Response(JSON.stringify(buildStoreManifest(store)), {
    headers: MANIFEST_HEADERS,
  });
}
