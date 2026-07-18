import { notFound } from 'next/navigation';
import { getPublicStoreBySlug, getPublicCatalog } from '@/server/queries/public-store';
import { CatalogView } from '@/components/storefront/catalog-view';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
}

export default async function StorePage({ params }: StorePageProps) {
  const { storeSlug } = await params;
  const store = await getPublicStoreBySlug(storeSlug);

  if (!store) {
    notFound();
  }

  const categories = await getPublicCatalog(
    store.id,
    store.tenantId,
    store.customization.categoryImages,
  );

  return (
    <CatalogView
      categories={categories}
      storeId={store.id}
      storeSlug={store.slug}
      storeOpen={store.status === 'OPEN'}
      customization={store.customization.config}
      banners={store.customization.banners}
    />
  );
}
