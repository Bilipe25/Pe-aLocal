import { notFound, redirect } from 'next/navigation';

import { CatalogView } from '@/components/storefront/catalog-view';
import { NetworkStatus } from '@/components/storefront/network-status';
import { PublicOrderHistory } from '@/components/storefront/public-order-history';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import { buildMenuJsonLd, serializeJsonLd } from '@/lib/storefront/jsonld';
import { getStorefrontCanonicalUrl } from '@/lib/storefront/urls';
import { couponCodeSchema } from '@/schemas/checkout';
import {
  getPublicCatalog,
  getPublicDeliveryZones,
  getPublicStoreBySlug,
} from '@/server/queries/public-store';
import { getRecentPurchasedProductsForCurrentDevice } from '@/server/queries/recent-purchases';

function formatStorefrontEstimate(minMinutes: number, maxMinutes: number) {
  return minMinutes === maxMinutes
    ? `Pronto em ${minMinutes} min`
    : `Pronto em ${minMinutes}–${maxMinutes} min`;
}

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ coupon?: string | string[] }>;
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const query = await searchParams;
  const rawCoupon = Array.isArray(query.coupon) ? query.coupon[0] : query.coupon;
  const parsedCoupon = rawCoupon ? couponCodeSchema.safeParse(rawCoupon) : null;
  const initialCouponCode = parsedCoupon?.success ? parsedCoupon.data : null;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    notFound();
  }
  if (store.slug !== storeSlug) {
    redirect(
      `/${store.slug}${
        initialCouponCode ? `?coupon=${encodeURIComponent(initialCouponCode)}` : ''
      }`,
    );
  }

  const [categories, deliveryZones, recentProducts] = await Promise.all([
    getPublicCatalog(store.id, store.tenantId, store.customization.categoryImages),
    store.settings?.deliveryEnabled ? getPublicDeliveryZones(store.id) : Promise.resolve([]),
    getRecentPurchasedProductsForCurrentDevice({
      tenantId: store.tenantId,
      storeId: store.id,
      enabled: store.settings?.showRecentPurchasesSection ?? true,
    }).catch(() => {
      console.error(
        JSON.stringify({
          event: 'recent_purchases_query_failed',
          storeId: store.id,
        }),
      );
      return [];
    }),
  ]);
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
  const config = store.customization.config;
  const canonicalUrl = getStorefrontCanonicalUrl({
    slug: store.slug,
    canonicalUrl: config.seo.canonicalUrl,
    primaryDomainHostname: store.customization.primaryDomain?.hostname,
  });
  const menuJsonLd = config.seo.indexable
    ? buildMenuJsonLd(store, categories, canonicalUrl)
    : null;

  return (
    <>
      {menuJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(menuJsonLd) }}
        />
      )}
      <NetworkStatus />

      {!store.availability.acceptingOrders && (
        <StoreClosedBanner availability={store.availability} />
      )}

      <StorefrontHero
        name={store.name}
        description={store.description}
        availability={store.availability}
        estimatedTime={
          store.settings
            ? formatStorefrontEstimate(
                store.settings.estimatedTimeMinMinutes,
                store.settings.estimatedTimeMaxMinutes,
              )
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

      <PublicOrderHistory
        storeId={store.id}
        storeSlug={store.slug}
      />

      <CatalogView
        categories={categories}
        storeId={store.id}
        storeSlug={store.slug}
        storeOpen={store.availability.acceptingOrders}
        customization={config}
        banners={store.customization.banners}
        initialCouponCode={initialCouponCode}
        recentProducts={recentProducts}
        showFeaturedProductsSection={store.settings?.showFeaturedProductsSection ?? true}
        minOrderValue={store.settings?.minOrderValue}
      />

      {config.platformBranding.showPedidoLocalBranding && (
        <footer className="storefront-branding px-4 py-8 text-center text-sm">
          Tecnologia por PedidoLocal
        </footer>
      )}

      <StorefrontBottomNav storeId={store.id} storeSlug={store.slug} showFavorites={false} />
    </>
  );
}
