import { redirect } from 'next/navigation';

import { OrdersPanel } from '@/components/dashboard/orders-panel';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = {
  title: 'Pedidos - Painel',
};

export default async function OrdersPage() {
  const context = await getActiveStoreContext();
  if (!context) redirect('/dashboard/stores');

  return <OrdersPanel storeId={context.store.id} />;
}
