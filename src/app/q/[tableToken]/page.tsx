import { Utensils } from 'lucide-react';

import { CatalogView } from '@/components/storefront/catalog-view';
import { DineInUnavailable } from '@/components/storefront/dine-in-unavailable';
import { NetworkStatus } from '@/components/storefront/network-status';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import { getPublicCatalog, getPublicOffers } from '@/server/queries/public-store';
import { getDineInStorefrontContext } from '@/server/services/dine-in-storefront.service';

export const dynamic = 'force-dynamic';

export default async function DineInMenuPage({
  params,
}: {
  params: Promise<{ tableToken: string }>;
}) {
  const { tableToken } = await params;
  const context = await getDineInStorefrontContext(tableToken);
  if (context.state !== 'READY') {
    return <DineInUnavailable state={context.state} storeName={context.store?.name} />;
  }
  const { store, table, cartScopeId } = context;
  const [categories, offers] = await Promise.all([
    getPublicCatalog(store.id, store.tenantId, store.customization.categoryImages),
    getPublicOffers(store.id, store.tenantId, store.timeZone),
  ]);
  const config = store.customization.config;

  return (
    <>
      <NetworkStatus />
      <div className="dine-in-context-banner" role="status">
        <Utensils aria-hidden="true" />
        <span>Você está na <strong>{table.label}</strong></span>
      </div>
      {!store.availability.acceptingOrders ? (
        <StoreClosedBanner availability={store.availability} />
      ) : null}
      <StorefrontHero
        name={store.name}
        description={store.description}
        availability={store.availability}
        estimatedTime={
          store.settings
            ? `Pronto em ${store.settings.estimatedTimeMinMinutes}–${store.settings.estimatedTimeMaxMinutes} min`
            : undefined
        }
        minOrderValue={store.settings?.minOrderValue}
        deliveryEnabled={false}
        pickupEnabled={false}
        minDeliveryFee={null}
        openingHours={store.openingHours}
        acceptsPix={context.paymentMethods.some((method) => method.method === 'PIX')}
        acceptsCash={context.paymentMethods.some((method) => method.method === 'CASH')}
        acceptsCardOnDelivery={context.paymentMethods.some(
          (method) => method.method === 'CARD_IN_PERSON',
        )}
        phone={store.phone}
        whatsapp={store.whatsapp}
        fullAddress={null}
        showEstimatedTimeInHero={store.settings?.showEstimatedTimeInHero}
        showFulfillmentInHero={false}
        showMinOrderValueInHero={store.settings?.showMinOrderValueInHero}
        showOpeningHoursInHero={store.settings?.showOpeningHoursInHero}
        logoUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoAssetId={store.customization.assets.logo?.id}
        coverUrl={store.customization.assets.cover?.url ?? store.coverUrl}
        coverAssetId={store.customization.assets.cover?.id}
        config={config}
      />
      <CatalogView
        categories={categories}
        offers={offers}
        storeId={store.id}
        storeSlug={store.slug}
        storeOpen={store.availability.acceptingOrders}
        customization={config}
        banners={store.customization.banners}
        showFeaturedProductsSection={store.settings?.showFeaturedProductsSection ?? true}
        minOrderValue={store.settings?.minOrderValue}
        cartScopeId={cartScopeId}
        cartHref={`/q/${tableToken}/cart`}
      />
    </>
  );
}
