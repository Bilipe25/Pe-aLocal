import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPublicStoreBySlug, getPublicDeliveryZones } from '@/server/queries/public-store';
import { CheckoutForm } from '@/components/storefront/checkout-form';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';

interface CheckoutPageProps {
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: CheckoutPageProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    return { title: 'Loja não encontrada' };
  }

  return {
    title: `Checkout - ${store.name}`,
    description: `Finalize seu pedido na ${store.name}`,
  };
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    notFound();
  }
  if (store.slug !== storeSlug) redirect(`/${store.slug}/checkout`);

  // Se não tem settings, não pode fazer checkout
  if (!store.settings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-text-muted text-center">
          Loja ainda não configurou as opções de pedido.
        </p>
        <Link
          href={`/${store.slug}`}
          className="storefront-link mt-4 inline-flex min-h-11 items-center hover:underline"
        >
          Voltar para a loja
        </Link>
      </div>
    );
  }

  // Buscar zonas de entrega se a loja aceita delivery
  const deliveryZones = store.settings.deliveryEnabled
    ? await getPublicDeliveryZones(store.id)
    : [];

  return (
    <div className="storefront-page-bottom-safe bg-papel min-h-screen">
      {/* Header Fixo */}
      <header className="border-tinta/10 bg-papel/80 sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href={`/${store.slug}/cart`}
            aria-label="Voltar para a sacola"
            className="text-tinta hover:bg-tinta/5 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-tinta text-lg font-bold">Finalizar pedido</h1>
            <p className="text-text-muted text-sm break-words">{store.name}</p>
          </div>
        </div>
      </header>

      {/* Loja Fechada Warning */}
      {!store.availability.acceptingOrders && (
        <div className="mx-auto max-w-md p-4 pb-0">
          <StoreClosedBanner availability={store.availability} />
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-md p-4">
        {store.availability.acceptingOrders ? (
          <CheckoutForm
            storeId={store.id}
            storeSlug={store.slug}
            minOrderValue={store.settings.minOrderValue}
            deliveryEnabled={store.settings.deliveryEnabled}
            pickupEnabled={store.settings.pickupEnabled}
            acceptsPix={store.settings.acceptsPix}
            acceptsCash={store.settings.acceptsCash}
            acceptsCardOnDelivery={store.settings.acceptsCardOnDelivery}
            deliveryZones={deliveryZones}
          />
        ) : (
          <div className="mt-8 text-center">
            <p className="text-text-muted mb-4 text-sm">{store.availability.reason}</p>
            <Link
              href={`/${store.slug}`}
              className="storefront-primary-action inline-flex min-h-11 items-center justify-center px-4 py-2 font-medium"
            >
              Voltar ao cardápio
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
