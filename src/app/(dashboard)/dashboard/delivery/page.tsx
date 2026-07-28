import { PageHeader } from '@/components/shared/page-header';
import { listDeliveryZonesAction } from '@/features/delivery/actions';
import { DeliveryZonesManager } from '@/features/delivery/components/delivery-zones-manager';
import { requirePermission } from '@/server/auth';
import { hasTenantPermission, Permission } from '@/server/permissions';

export const metadata = { title: 'Zonas de entrega' };

export default async function DeliveryPage() {
  const [zones, session] = await Promise.all([
    listDeliveryZonesAction(),
    requirePermission(Permission.CONFIGURE_DELIVERY_ZONES),
  ]);
  const canEdit = hasTenantPermission(session.tenantRole, Permission.MANAGE_DELIVERY);

  return (
    <div>
      <PageHeader
        title="Zonas de entrega"
        description="Configure onde a loja entrega e quanto cada região paga."
      />
      <DeliveryZonesManager zones={zones} canEdit={canEdit} />
    </div>
  );
}
