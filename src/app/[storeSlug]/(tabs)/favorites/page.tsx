import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { StorefrontFavorites } from '@/components/storefront/storefront-favorites';
import { getPublicCatalog, getPublicStoreBySlug } from '@/server/queries/public-store';

interface FavoritesPageProps {
  params: Promise<{ storeSlug: string }>;
}

export async function generateMetadata({ params }: FavoritesPageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  return {
    title: store ? `Favoritos | ${store.name}` : 'Favoritos',
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default async function FavoritesPage({ params }: FavoritesPageProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/favorites`);

  const categories = await getPublicCatalog(
    store.id,
    store.tenantId,
    store.customization.categoryImages,
  );

  return (
    <div className="storefront-page-bottom-safe">
      <StorePurchaseHeader
        backHref={`/${store.slug}/mais`}
        backLabel="Voltar a Mais"
        title="Favoritos"
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />
      <main className="storefront-favorites-main">
        <StorefrontFavorites
          storeId={store.id}
          storeSlug={store.slug}
          categories={categories}
          customization={store.customization.config}
        />
      </main>
    </div>
  );
}
