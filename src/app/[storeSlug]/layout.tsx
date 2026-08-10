import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';

import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';
import { getStorefrontCanonicalUrl } from '@/lib/storefront/urls';
import { getPublicStoreBySlug } from '@/server/queries/public-store';

interface StoreLayoutProps {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: StoreLayoutProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) return { title: 'Loja não encontrada', robots: { index: false, follow: false } };

  const config = store.customization.config;
  const title = config.seo.title || store.name;
  const description =
    config.seo.description ||
    config.identity.shortDescription ||
    store.description ||
    `Faça seu pedido em ${store.name}`;
  const socialImage =
    store.customization.assets.socialImage?.url ??
    store.customization.assets.cover?.url ??
    store.coverUrl ??
    store.customization.assets.logo?.url ??
    store.logoUrl;
  const canonical = getStorefrontCanonicalUrl({
    slug: store.slug,
    canonicalUrl: config.seo.canonicalUrl,
    primaryDomainHostname: store.customization.primaryDomain?.hostname,
  });

  return {
    title: { default: title, template: `%s | ${store.name}` },
    description,
    alternates: canonical ? { canonical } : undefined,
    manifest: `/${encodeURIComponent(store.slug)}/manifest.webmanifest`,
    icons: {
      icon: store.customization.assets.favicon
        ? [{ url: store.customization.assets.favicon.url }]
        : [{ url: '/pwa/pedidolocal-icon-v1-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/pwa/apple-touch-icon-v1-180.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: {
      capable: true,
      title: store.name,
      statusBarStyle: 'default',
    },
    robots: { index: config.seo.indexable, follow: config.seo.indexable },
    openGraph: {
      title,
      description,
      type: 'website',
      images: socialImage ? [{ url: socialImage }] : undefined,
    },
  };
}

export async function generateViewport({ params }: StoreLayoutProps): Promise<Viewport> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: store?.customization.config.palette.primary ?? '#D9480F',
  };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) notFound();

  const config = store.customization.config;

  return (
    <div
      className={`storefront-theme ${storefrontLayoutClass(config)} storefront-button-${config.typography.buttonStyle} storefront-cart-${config.layout.cartPresentation.toLowerCase()} min-h-screen`}
      style={getStorefrontThemeStyle(config)}
      data-customization-version={store.customization.publishedVersion}
      data-customization-source={store.customization.source}
    >
      {children}
    </div>
  );
}
