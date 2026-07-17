import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { StoreHeader } from '@/components/storefront/store-header';
import {
  getStorefrontThemeStyle,
  storefrontLayoutClass,
} from '@/features/customization/theme';
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
  const title = config.seo.title || `${store.name} | PedidoLocal`;
  const description =
    config.seo.description ||
    config.identity.shortDescription ||
    store.description ||
    `Faça seu pedido em ${store.name}`;
  const socialImage = store.coverUrl ?? store.logoUrl;
  let canonical = config.seo.canonicalUrl ?? undefined;
  if (!canonical && process.env.APP_URL) {
    try {
      canonical = new URL(`/${store.slug}`, process.env.APP_URL).toString();
    } catch {
      canonical = undefined;
    }
  }

  return {
    title: { default: title, template: `%s | ${store.name}` },
    description,
    alternates: canonical ? { canonical } : undefined,
    robots: { index: config.seo.indexable, follow: config.seo.indexable },
    openGraph: {
      title,
      description,
      type: 'website',
      images: socialImage ? [{ url: socialImage }] : undefined,
    },
  };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) notFound();

  const config = store.customization.config;
  const storeOpen = store.status === 'OPEN';

  return (
    <div
      className={`storefront-theme ${storefrontLayoutClass(config)} storefront-button-${config.typography.buttonStyle} storefront-cart-${config.layout.cartPresentation.toLowerCase()} min-h-screen`}
      style={getStorefrontThemeStyle(config)}
      data-customization-version={store.customization.publishedVersion}
      data-customization-source={store.customization.source}
    >
      <StoreHeader
        name={store.name}
        description={store.description}
        status={store.status}
        estimatedTime={store.settings?.estimatedTime}
        neighborhood={store.address?.neighborhood}
        city={store.address?.city}
        logoUrl={store.logoUrl}
        coverUrl={store.coverUrl}
        config={config}
      />

      {!storeOpen && <StoreClosedBanner status={store.status as 'CLOSED' | 'PAUSED'} />}

      {children}

      {config.platformBranding.showPedidoLocalBranding && (
        <footer className="storefront-branding px-4 py-8 text-center text-xs">
          Tecnologia por PedidoLocal
        </footer>
      )}
    </div>
  );
}
