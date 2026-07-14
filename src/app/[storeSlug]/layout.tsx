import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicStoreBySlug } from '@/server/queries/public-store';
import { StoreHeader } from '@/components/storefront/store-header';
import { StoreClosedBanner } from '@/components/storefront/store-closed-banner';

interface StoreLayoutProps {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: StoreLayoutProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    return { title: 'Loja não encontrada' };
  }

  return {
    title: {
      default: `${store.name} | PedidoLocal`,
      template: `%s | ${store.name}`,
    },
    description: store.description ?? `Faça seu pedido em ${store.name}`,
    openGraph: {
      title: store.name,
      description: store.description ?? `Cardápio de ${store.name}`,
      type: 'website',
    },
  };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    notFound();
  }

  const storeOpen = store.status === 'OPEN';

  return (
    <div className="min-h-screen bg-papel">
      <StoreHeader
        name={store.name}
        description={store.description}
        status={store.status}
        estimatedTime={store.settings?.estimatedTime}
        neighborhood={store.address?.neighborhood}
        city={store.address?.city}
      />

      {!storeOpen && (
        <StoreClosedBanner status={store.status as 'CLOSED' | 'PAUSED'} />
      )}

      {children}
    </div>
  );
}
