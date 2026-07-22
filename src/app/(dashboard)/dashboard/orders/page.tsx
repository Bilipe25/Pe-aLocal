import { redirect } from 'next/navigation';

import { OrdersPanel } from '@/components/dashboard/orders-panel';
import { getStoreLocalDate } from '@/lib/time/store-time';
import { Permission } from '@/server/permissions';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = {
  title: 'Pedidos - Painel',
};

export default async function OrdersPage() {
  const context = await getActiveStoreContext(Permission.VIEW_ORDERS);
  if (!context) redirect('/dashboard/stores');

  return (
    <OrdersPanel
      storeId={context.store.id}
      storeName={context.store.name}
      timeZone={context.store.timeZone}
      initialLocalDate={getStoreLocalDate(new Date(), context.store.timeZone)}
      authorizationScope={`${context.session.userId}:${context.session.tenantRole}`}
    />
  );
}
