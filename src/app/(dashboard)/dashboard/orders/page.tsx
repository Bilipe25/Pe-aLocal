import { redirect } from 'next/navigation';

import { OrdersPanel } from '@/components/dashboard/orders-panel';
import { getOrderCapabilities } from '@/features/orders/capabilities';
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
      capabilities={getOrderCapabilities(context.session.tenantRole)}
    />
  );
}
