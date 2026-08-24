import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

import { DiningRoomWorkspace } from '@/features/dining-room/dining-room-workspace';
import { diningRoomQueryKeys } from '@/lib/query/keys/dining-room';
import { Permission } from '@/server/permissions';
import { getDiningRoomSnapshotForStore } from '@/server/services/dining-table-session.service';
import { getActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = { title: 'Salão — PedidoLocal' };

export default async function DiningRoomPage() {
  const context = await getActiveStoreContext(Permission.VIEW_DINING_ROOM);
  if (!context) redirect('/dashboard/stores');
  const initialSnapshot = await getDiningRoomSnapshotForStore({
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    storeName: context.store.name,
    enabledForNewOrders: context.store.entitlement?.dineInQrEnabled === true,
  });
  const authorizationScope = `${context.session.userId}:${context.session.tenantRole}`;
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    diningRoomQueryKeys.snapshot(context.store.id, authorizationScope),
    initialSnapshot,
  );
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DiningRoomWorkspace
        storeId={context.store.id}
        authorizationScope={authorizationScope}
        initialSnapshot={initialSnapshot}
      />
    </HydrationBoundary>
  );
}
