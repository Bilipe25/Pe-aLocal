import { notFound, redirect } from 'next/navigation';
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
  if (store.slug !== storeSlug) redirect(`/${store.slug}`);

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
      storeOpen={store.availability.acceptingOrders}
      customization={store.customization.config}
      banners={store.customization.banners}
    />
  );
}
