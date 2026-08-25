import { cookies } from 'next/headers';

import { ConsumerRepurchaseSection } from '@/components/storefront/consumer-repurchase-section';
import { RecentOrdersSection } from '@/components/storefront/recent-orders-section';
import { getRecentOrdersForCurrentDevice } from '@/server/queries/recent-orders';
import { CONSUMER_SESSION_COOKIE } from '@/server/services/consumer-auth.service';
import { getConsumerRepurchaseShortcuts } from '@/server/services/consumer-repurchase.service';

export async function ConsumerRepurchaseLoader(props: {
  storeId: string;
  storeSlug: string;
  tenantId: string;
  recentOrdersEnabled: boolean;
}) {
  const sessionToken = (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value;
  const shortcuts = await getConsumerRepurchaseShortcuts({
    storeSlug: props.storeSlug,
    sessionToken,
  }).catch(() => null);
  if (shortcuts && (shortcuts.usual || shortcuts.frequent.length > 0)) {
    return <ConsumerRepurchaseSection {...props} shortcuts={shortcuts} />;
  }
  const orders = await getRecentOrdersForCurrentDevice({
    tenantId: props.tenantId,
    storeId: props.storeId,
    enabled: props.recentOrdersEnabled,
  }).catch(() => []);
  if (orders.length === 0) return null;
  return (
    <RecentOrdersSection storeId={props.storeId} storeSlug={props.storeSlug} orders={orders} />
  );
}
