import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CheckoutFormLoader } from '@/components/storefront/checkout-form-loader';
import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { getPublicDeliveryZones, getPublicStoreBySlug } from '@/server/queries/public-store';

interface CheckoutPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{
    step?: string;
    modality?: string;
    coupon?: string;
  }>;
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);
  if (!store) return { title: 'Loja não encontrada', robots: { index: false } };

  return {
    title: `Finalizar pedido | ${store.name}`,
    description: `Revise e confirme seu pedido na ${store.name}.`,
    robots: { index: false, follow: false },
  };
}

function parseModality(
  value: string | undefined,
  deliveryEnabled: boolean,
  pickupEnabled: boolean,
) {
  if (value === 'DELIVERY' && deliveryEnabled) return 'DELIVERY' as const;
  if (value === 'PICKUP' && pickupEnabled) return 'PICKUP' as const;
  return undefined;
}

function parseCouponCode(value?: string) {
  const normalized = value?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9_-]{1,32}$/.test(normalized) ? normalized : undefined;
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const [{ storeSlug }, query] = await Promise.all([params, searchParams]);
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/checkout`);

  if (!store.settings) {
    return (
      <main className="bg-papel flex min-h-screen flex-col items-center justify-center p-4">
        <Store className="text-text-muted h-10 w-10" aria-hidden="true" />
        <h1 className="font-display text-tinta mt-4 text-xl font-bold">Pedidos indisponíveis</h1>
        <p className="text-text-muted mt-2 max-w-sm text-center text-sm">
          A loja ainda não configurou as opções necessárias para receber pedidos.
        </p>
        <Link
          href={`/${store.slug}`}
          className="storefront-link mt-5 inline-flex min-h-11 items-center px-3 font-semibold"
        >
          Voltar ao cardápio
        </Link>
      </main>
    );
  }

  const logoUrl = store.customization.assets.logo?.url ?? store.logoUrl;
  const logoAssetId = store.customization.assets.logo?.id ?? null;
  const deliveryZones = store.settings.deliveryEnabled
    ? await getPublicDeliveryZones(store.id)
    : [];
  const deliveryEnabled = store.settings.deliveryEnabled && deliveryZones.length > 0;

  return (
    <div className="storefront-checkout-page">
      <div className="storefront-checkout-shell">
        <StorePurchaseHeader
          backHref={`/${store.slug}/cart`}
          backLabel="Voltar para a sacola"
          title="Finalizar pedido"
          storeName={store.name}
          logoImageUrl={logoUrl}
          logoImageAssetId={logoAssetId}
        />

        {!store.availability.acceptingOrders && (
          <div className="storefront-checkout-availability">
            <StoreClosedBanner availability={store.availability} />
          </div>
        )}

        <main className="storefront-checkout-main">
          {store.availability.acceptingOrders ? (
            <CheckoutFormLoader
              storeId={store.id}
              storeSlug={store.slug}
              minOrderValue={store.settings.minOrderValue}
              deliveryEnabled={deliveryEnabled}
              pickupEnabled={store.settings.pickupEnabled}
              acceptsPix={store.settings.acceptsPix}
              acceptsCash={store.settings.acceptsCash}
              acceptsCardOnDelivery={store.settings.acceptsCardOnDelivery}
              deliveryZones={deliveryZones}
              storeCity={store.address?.city ?? ''}
              storeState={store.address?.state ?? ''}
              initialModality={parseModality(
                query.modality,
                deliveryEnabled,
                store.settings.pickupEnabled,
              )}
              initialCouponCode={parseCouponCode(query.coupon)}
            />
          ) : (
            <div className="storefront-checkout-unavailable">
              <p>{store.availability.reason}</p>
              <Link
                href={`/${store.slug}`}
                className="storefront-primary-action mt-5 inline-flex min-h-11 items-center justify-center px-4 font-semibold"
              >
                Voltar ao cardápio
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
