import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

import { KdsBoard } from '@/components/kds/kds-board';
import { kdsQueryKeys } from '@/lib/query/keys/kds';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { getKdsSnapshot } from '@/server/services/kds-query.service';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = {
  title: 'Tela da cozinha - PedidoLocal',
};

export default async function KdsPage() {
  const context = await getActiveStoreContext(Permission.VIEW_ORDERS);
  if (!context) redirect('/dashboard/stores');
  if (
    !context.store.entitlement?.kdsEnabled ||
    !hasTenantPermission(context.session.tenantRole, Permission.UPDATE_ORDER_STATUS)
  ) {
    redirect('/dashboard');
  }

  const initialSnapshot = await getKdsSnapshot({
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    estimatedTimeMaxMinutes: context.store.settings?.estimatedTimeMaxMinutes ?? 50,
  });
  const authorizationScope = `${context.session.userId}:${context.session.tenantRole}`;
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    kdsQueryKeys.snapshot(context.store.id, authorizationScope),
    initialSnapshot,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <KdsBoard
        storeId={context.store.id}
        storeName={context.store.name}
        authorizationScope={authorizationScope}
        initialSnapshot={initialSnapshot}
      />
    </HydrationBoundary>
  );
}
