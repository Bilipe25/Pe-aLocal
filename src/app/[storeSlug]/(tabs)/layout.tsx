import { notFound } from 'next/navigation';

import { NetworkStatus } from '@/components/storefront/network-status';
import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { StorefrontClientStateProvider } from '@/components/storefront/storefront-client-state-provider';
import { getPublicStoreShellBySlug } from '@/server/queries/public-store';

export default async function StorefrontTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getPublicStoreShellBySlug(storeSlug);
  if (!store) notFound();

  return (
    <StorefrontClientStateProvider storeId={store.id} storeSlug={store.slug}>
      <NetworkStatus />
      {children}
      <StorefrontBottomNav storeId={store.id} storeSlug={store.slug} />
    </StorefrontClientStateProvider>
  );
}
