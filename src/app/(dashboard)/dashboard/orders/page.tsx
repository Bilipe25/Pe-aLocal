import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

import { OrdersPanel } from '@/components/dashboard/orders-panel';
import { ORDER_ACTIVE_STATUSES } from '@/features/orders/query-constants';
import { getStoreLocalDate } from '@/lib/time/store-time';
import { orderQueryKeys } from '@/lib/query/keys/orders';
import { Permission } from '@/server/permissions';
import { getOrderBoardBootstrap } from '@/server/services/order-query.service';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = {
  title: 'Pedidos - Painel',
};

export default async function OrdersPage() {
  const context = await getActiveStoreContext(Permission.VIEW_ORDERS);
  if (!context) redirect('/dashboard/stores');
  const initialLocalDate = getStoreLocalDate(new Date(), context.store.timeZone);
  const queryContext = {
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    timeZone: context.store.timeZone,
    userId: context.session.userId,
    tenantRole: context.session.tenantRole,
    estimatedTimeMaxMinutes: context.store.settings?.estimatedTimeMaxMinutes ?? 50,
    operationalSlaEnabled: context.store.entitlement?.operationalSlaEnabled ?? false,
    operationalSlaEnabledAt: context.store.entitlement?.operationalSlaEnabledAt ?? null,
  };
  const { notificationBaseline, initialBoard } = await getOrderBoardBootstrap(queryContext, {
    localDate: initialLocalDate,
    statuses: ORDER_ACTIVE_STATUSES,
  });
  const authorizationScope = `${context.session.userId}:${context.session.tenantRole}`;
  const initialFilters = {
    localDate: initialLocalDate,
    statuses: [...ORDER_ACTIVE_STATUSES],
  };
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    orderQueryKeys.board(context.store.id, authorizationScope, initialFilters),
    initialBoard,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrdersPanel
        storeId={context.store.id}
        storeName={context.store.name}
        storeSlug={context.store.slug}
        timeZone={context.store.timeZone}
        initialLocalDate={initialLocalDate}
        authorizationScope={authorizationScope}
        notificationBaseline={notificationBaseline}
        initialBoard={initialBoard}
      />
    </HydrationBoundary>
  );
}
