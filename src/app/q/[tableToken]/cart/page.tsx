import { CartView } from '@/components/storefront/cart-view';
import { DineInUnavailable } from '@/components/storefront/dine-in-unavailable';
import { getPublicOffers } from '@/server/queries/public-store';
import { getDineInStorefrontContext } from '@/server/services/dine-in-storefront.service';

export const dynamic = 'force-dynamic';

export default async function DineInCartPage({
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
  const offers = await getPublicOffers(store.id, store.tenantId, store.timeZone);
  return (
    <CartView
      storeId={cartScopeId}
      storeSlug={store.slug}
      storeName={store.name}
      logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
      logoImageAssetId={store.customization.assets.logo?.id ?? null}
      acceptingOrders={store.availability.acceptingOrders}
      unavailableReason={store.availability.reason}
      baseHref={`/q/${tableToken}`}
      checkoutHref={`/q/${tableToken}/checkout`}
      quoteEndpoint={`/api/storefront/q/${tableToken}/checkout/quote`}
      quoteModality="DINE_IN"
      contextLabel={`Você está na ${table.label}`}
      deliveryEnabled={false}
      pickupEnabled={false}
      comboOffers={offers.filter((offer) => offer.kind !== 'PRODUCT_PROMOTION')}
    />
  );
}
