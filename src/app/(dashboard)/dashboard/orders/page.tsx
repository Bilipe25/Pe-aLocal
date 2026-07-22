import { redirect } from 'next/navigation';

import { OrdersPanel } from '@/components/dashboard/orders-panel';
import { getStoreLocalDate } from '@/lib/time/store-time';
import { Permission } from '@/server/permissions';
import { getOrderNotificationSignals } from '@/server/services/order-query.service';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = {
  title: 'Pedidos - Painel',
};

export default async function OrdersPage() {
  const context = await getActiveStoreContext(Permission.VIEW_ORDERS);
  if (!context) redirect('/dashboard/stores');
  const notificationBaseline = await getOrderNotificationSignals({
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    timeZone: context.store.timeZone,
    userId: context.session.userId,
    tenantRole: context.session.tenantRole,
    estimatedTimeMaxMinutes: context.store.settings?.estimatedTimeMaxMinutes ?? 50,
  });

  return (
    <OrdersPanel
      storeId={context.store.id}
      storeName={context.store.name}
      storeSlug={context.store.slug}
      timeZone={context.store.timeZone}
      initialLocalDate={getStoreLocalDate(new Date(), context.store.timeZone)}
      authorizationScope={`${context.session.userId}:${context.session.tenantRole}`}
      notificationBaseline={notificationBaseline}
    />
  );
}
