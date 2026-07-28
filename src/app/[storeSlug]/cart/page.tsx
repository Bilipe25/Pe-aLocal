import { notFound, redirect } from 'next/navigation';

import { CartView } from '@/components/storefront/cart-view';
import { getPublicDeliveryZones, getPublicStoreBySlug } from '@/server/queries/public-store';

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/cart`);

  const deliveryZones = store.settings?.deliveryEnabled
    ? await getPublicDeliveryZones(store.id)
    : [];

  return (
    <CartView
      storeId={store.id}
      storeSlug={store.slug}
      storeName={store.name}
      logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
      logoImageAssetId={store.customization.assets.logo?.id ?? null}
      acceptingOrders={store.availability.acceptingOrders}
      unavailableReason={store.availability.reason}
      deliveryEnabled={Boolean(store.settings?.deliveryEnabled && deliveryZones.length > 0)}
      pickupEnabled={Boolean(store.settings?.pickupEnabled)}
    />
  );
}
