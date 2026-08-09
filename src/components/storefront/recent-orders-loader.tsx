import { RecentOrdersSection } from '@/components/storefront/recent-orders-section';
import { getRecentOrdersForCurrentDevice } from '@/server/queries/recent-orders';

interface RecentOrdersLoaderProps {
  tenantId: string;
  storeId: string;
  storeSlug: string;
  enabled: boolean;
}

export async function RecentOrdersLoader({
  tenantId,
  storeId,
  storeSlug,
  enabled,
}: RecentOrdersLoaderProps) {
  const orders = await getRecentOrdersForCurrentDevice({ tenantId, storeId, enabled }).catch(() => {
    console.error(JSON.stringify({ event: 'recent_orders_query_failed', storeId }));
    return [];
  });
  if (orders.length === 0) return null;
  return <RecentOrdersSection storeId={storeId} storeSlug={storeSlug} orders={orders} />;
}
