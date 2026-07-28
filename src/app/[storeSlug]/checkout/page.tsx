import { ArrowLeft, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { CheckoutFormLoader } from '@/components/storefront/checkout-form-loader';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';
import { getPublicDeliveryZones, getPublicStoreBySlug } from '@/server/queries/public-store';

type CheckoutStep = 'identification' | 'fulfillment' | 'payment' | 'review';

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

function parseStep(value?: string): CheckoutStep {
  return value === 'fulfillment' || value === 'payment' || value === 'review'
    ? value
    : 'identification';
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
  const deliveryZones = store.settings.deliveryEnabled
    ? await getPublicDeliveryZones(store.id)
    : [];
  const deliveryEnabled = store.settings.deliveryEnabled && deliveryZones.length > 0;

  return (
    <div className="bg-papel min-h-screen pb-28 lg:pb-12">
      <header className="border-tinta/10 bg-papel/95 sticky top-0 z-30 border-b px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            href={`/${store.slug}/cart`}
            aria-label="Voltar para a sacola"
            className="text-tinta hover:bg-tinta/5 focus-visible:ring-pimenta flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="border-tinta/10 bg-papel relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
            {logoUrl ? (
              <Image src={logoUrl} alt="" fill sizes="40px" className="object-cover" />
            ) : (
              <Store className="text-text-muted h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-text-muted text-xs font-semibold tracking-wide uppercase">
              Checkout seguro
            </p>
            <p className="font-display text-tinta truncate text-base font-bold">{store.name}</p>
          </div>
        </div>
      </header>

      {!store.availability.acceptingOrders && (
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
          <StoreClosedBanner availability={store.availability} />
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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
            initialStep={parseStep(query.step)}
            initialModality={parseModality(
              query.modality,
              deliveryEnabled,
              store.settings.pickupEnabled,
            )}
            initialCouponCode={parseCouponCode(query.coupon)}
          />
        ) : (
          <div className="border-tinta/10 bg-papel mx-auto mt-8 max-w-md rounded-2xl border p-6 text-center">
            <p className="text-text-muted text-sm">{store.availability.reason}</p>
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
  );
}
