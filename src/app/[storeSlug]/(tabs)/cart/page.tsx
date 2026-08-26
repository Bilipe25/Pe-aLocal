import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CartView } from '@/components/storefront/cart-view';
import { getPublicCartStoreBySlug, getPublicOffers } from '@/server/queries/public-store';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicCartStoreBySlug(storeSlug);

  return {
    title: store ? `Sua sacola | ${store.name}` : 'Sua sacola',
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicCartStoreBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/cart`);
  const comboOffersPromise = getPublicOffers(store.id, store.tenantId, store.timeZone).then(
    (offers) => offers.filter((offer) => offer.kind !== 'PRODUCT_PROMOTION'),
  );

  return (
    <CartView
      storeId={store.id}
      storeSlug={store.slug}
      storeName={store.name}
      logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
      logoImageAssetId={store.customization.assets.logo?.id ?? null}
      acceptingOrders={store.availability.acceptingOrders}
      unavailableReason={store.availability.reason}
      deliveryEnabled={Boolean(store.settings?.deliveryEnabled)}
      pickupEnabled={Boolean(store.settings?.pickupEnabled)}
      comboOffers={comboOffersPromise}
    />
  );
}
