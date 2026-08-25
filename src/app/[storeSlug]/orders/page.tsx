import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { PublicOrderHistory } from '@/components/storefront/public-order-history';
import { ConsumerAuthPanel } from '@/components/storefront/consumer-auth-panel';
import { ConsumerOrderHistory } from '@/components/storefront/consumer-order-history';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { getPublicPurchaseStoreBySlug } from '@/server/queries/public-store';
import { AuthenticationError } from '@/server/errors';
import { listConsumerOrders } from '@/server/services/consumer-account.service';
import { CONSUMER_SESSION_COOKIE, getConsumerStoreScope } from '@/server/services/consumer-auth.service';

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

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ storeSlug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { storeSlug } = await params;
  const store = await getPublicPurchaseStoreBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/orders`);
  const scope = await getConsumerStoreScope(store.slug);
  const featureEnabled = scope?.entitlement?.consumerIdentityEnabled === true;
  const requestedPage = Number((await searchParams).page ?? '1');
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let verifiedOrders: Awaited<ReturnType<typeof listConsumerOrders>> | null = null;
  if (featureEnabled) {
    try {
      verifiedOrders = await listConsumerOrders({
        storeSlug: store.slug,
        sessionToken: (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value,
        page,
      });
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
    }
  }

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
        {verifiedOrders ? (
          <>
            <ConsumerOrderHistory
              storeId={store.id}
              storeSlug={store.slug}
              customerName={verifiedOrders.customerName}
              active={verifiedOrders.active.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() }))}
              previous={verifiedOrders.previous.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() }))}
              hasMore={verifiedOrders.hasMore}
              page={page}
            />
            <div className="border-border mt-8 border-t pt-7">
              <h2 className="font-bold">Pedidos lembrados neste aparelho</h2>
              <p className="text-text-secondary mt-1 text-sm">Pedidos locais que ainda não estão vinculados à sua conta.</p>
              <PublicOrderHistory storeId={store.id} storeSlug={store.slug} excludeOrderNumbers={[...verifiedOrders.active, ...verifiedOrders.previous].map((order) => order.orderNumber)} />
            </div>
          </>
        ) : (
          <>
            <PublicOrderHistory storeId={store.id} storeSlug={store.slug} />
            {featureEnabled ? <ConsumerAuthPanel storeSlug={store.slug} storeName={store.name} /> : null}
          </>
        )}
      </main>

      <StorefrontBottomNav storeId={store.id} storeSlug={store.slug} />
    </div>
  );
}
