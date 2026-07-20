import { notFound } from 'next/navigation';

import { CartView } from '@/components/storefront/cart-view';
import { getPublicStoreBySlug } from '@/server/queries/public-store';

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);
  if (!store) notFound();

  return (
    <CartView
      storeSlug={storeSlug}
      acceptingOrders={store.availability.acceptingOrders}
      unavailableReason={store.availability.reason}
    />
  );
}
