import { notFound } from 'next/navigation';
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

  // Se não tem settings, não pode fazer checkout
  if (!store.settings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-center text-tinta/60">
          Loja ainda não configurou as opções de pedido.
        </p>
        <Link href={`/${storeSlug}`} className="mt-4 text-pimenta hover:underline">
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
    <div className="min-h-screen bg-papel pb-24">
      {/* Header Fixo */}
      <header className="sticky top-0 z-40 border-b border-tinta/10 bg-papel/80 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link
            href={`/${storeSlug}/cart`}
            className="rounded-full p-2 text-tinta hover:bg-tinta/5 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-display text-lg font-bold text-tinta">Finalizar Pedido</h1>
            <p className="text-xs text-tinta/60">{store.name}</p>
          </div>
        </div>
      </header>

      {/* Loja Fechada Warning */}
      {store.status !== 'OPEN' && (
        <div className="mx-auto max-w-md p-4 pb-0">
          <StoreClosedBanner status={store.status as 'CLOSED' | 'PAUSED'} />
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-md p-4">
        {store.status === 'OPEN' ? (
          <CheckoutForm
            storeSlug={storeSlug}
            deliveryEnabled={store.settings.deliveryEnabled}
            pickupEnabled={store.settings.pickupEnabled}
            acceptsPix={store.settings.acceptsPix}
            acceptsCash={store.settings.acceptsCash}
            acceptsCardOnDelivery={store.settings.acceptsCardOnDelivery}
            deliveryZones={deliveryZones}
          />
        ) : (
          <div className="mt-8 text-center">
            <p className="text-sm text-tinta/60 mb-4">
              Não é possível fazer pedidos no momento pois a loja está fechada.
            </p>
            <Link
              href={`/${storeSlug}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-pimenta px-4 py-2 font-medium text-white hover:bg-pimenta/90"
            >
              Voltar ao cardápio
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
