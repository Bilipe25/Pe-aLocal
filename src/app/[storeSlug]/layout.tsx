import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { StoreHeaderVisibility } from '@/components/storefront/store-header-visibility';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';
import { getPublicDeliveryZones, getPublicStoreBySlug } from '@/server/queries/public-store';

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
  let canonical =
    config.seo.canonicalUrl ??
    (store.customization.primaryDomain
      ? `https://${store.customization.primaryDomain.hostname}/`
      : undefined);
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
    icons: store.customization.assets.favicon
      ? { icon: store.customization.assets.favicon.url }
      : undefined,
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
  const deliveryZones = store.settings?.deliveryEnabled
    ? await getPublicDeliveryZones(store.id)
    : [];
  const minDeliveryFee =
    deliveryZones.length > 0 ? Math.min(...deliveryZones.map((zone) => zone.fee)) : null;
  const fullAddress =
    store.address && 'street' in store.address
      ? {
          street: store.address.street,
          number: store.address.number,
          complement: store.address.complement,
          neighborhood: store.address.neighborhood,
          city: store.address.city,
          state: store.address.state,
          zipCode: store.address.zipCode,
        }
      : null;

  return (
    <div
      className={`storefront-theme ${storefrontLayoutClass(config)} storefront-button-${config.typography.buttonStyle} storefront-cart-${config.layout.cartPresentation.toLowerCase()} min-h-screen`}
      style={getStorefrontThemeStyle(config)}
      data-customization-version={store.customization.publishedVersion}
      data-customization-source={store.customization.source}
    >
      <StoreHeaderVisibility>
        <StorefrontHero
          name={store.name}
          description={store.description}
          availability={store.availability}
          estimatedTime={
            store.settings
              ? `${store.settings.estimatedTimeMinMinutes}-${store.settings.estimatedTimeMaxMinutes} min`
              : undefined
          }
          minOrderValue={store.settings?.minOrderValue}
          deliveryEnabled={Boolean(store.settings?.deliveryEnabled && deliveryZones.length > 0)}
          pickupEnabled={store.settings?.pickupEnabled}
          minDeliveryFee={minDeliveryFee}
          openingHours={store.openingHours}
          acceptsPix={store.settings?.acceptsPix}
          acceptsCash={store.settings?.acceptsCash}
          acceptsCardOnDelivery={store.settings?.acceptsCardOnDelivery}
          phone={store.phone}
          whatsapp={store.whatsapp}
          fullAddress={fullAddress}
          showEstimatedTimeInHero={store.settings?.showEstimatedTimeInHero}
          showFulfillmentInHero={store.settings?.showFulfillmentInHero}
          showMinOrderValueInHero={store.settings?.showMinOrderValueInHero}
          showOpeningHoursInHero={store.settings?.showOpeningHoursInHero}
          logoUrl={store.customization.assets.logo?.url ?? store.logoUrl}
          logoAssetId={store.customization.assets.logo?.id}
          coverUrl={store.customization.assets.cover?.url ?? store.coverUrl}
          coverAssetId={store.customization.assets.cover?.id}
          config={config}
        />
      </StoreHeaderVisibility>

      {children}

      {config.platformBranding.showPedidoLocalBranding && (
        <footer className="storefront-branding px-4 py-8 text-center text-sm">
          Tecnologia por PedidoLocal
        </footer>
      )}

      <StorefrontBottomNav storeId={store.id} storeSlug={store.slug} />
    </div>
  );
}
