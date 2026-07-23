import { notFound, redirect } from 'next/navigation';

import { CartView } from '@/components/storefront/cart-view';
import { getPublicStoreBySlug } from '@/server/queries/public-store';

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/cart`);

  return (
    <CartView
      storeId={store.id}
      storeSlug={store.slug}
      acceptingOrders={store.availability.acceptingOrders}
      unavailableReason={store.availability.reason}
    />
  );
}
