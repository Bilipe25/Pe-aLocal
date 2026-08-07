import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { PublicOrderHistory } from '@/components/storefront/public-order-history';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { getPublicPurchaseStoreBySlug } from '@/server/queries/public-store';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicPurchaseStoreBySlug(storeSlug);

  return {
    title: store ? `Meus pedidos | ${store.name}` : 'Meus pedidos',
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default async function OrdersPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicPurchaseStoreBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/orders`);

  return (
    <div className="storefront-page-bottom-safe">
      <StorePurchaseHeader
        backHref={`/${store.slug}`}
        backLabel="Voltar ao cardápio"
        title="Meus pedidos"
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />

      <main className="storefront-orders-main">
        <PublicOrderHistory
          storeId={store.id}
          storeSlug={store.slug}
        />
      </main>

      <StorefrontBottomNav
        storeId={store.id}
        storeSlug={store.slug}
      />
    </div>
  );
}
