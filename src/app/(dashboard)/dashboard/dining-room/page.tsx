import { redirect } from 'next/navigation';

import { DiningRoomWorkspace } from '@/features/dining-room/dining-room-workspace';
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
  return (
    <DiningRoomWorkspace
      storeId={context.store.id}
      authorizationScope={`${context.session.userId}:${context.session.tenantRole}`}
      initialSnapshot={initialSnapshot}
    />
  );
}
