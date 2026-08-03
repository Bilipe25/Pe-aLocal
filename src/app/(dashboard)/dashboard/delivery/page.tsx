import { PageHeader } from '@/components/shared/page-header';
import { DeliveryZonesManager } from '@/features/delivery/components/delivery-zones-manager';
import { hasTenantPermission, Permission } from '@/server/permissions';
import * as deliveryZoneRepo from '@/server/repositories/delivery-zone.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = { title: 'Entrega' };

export default async function DeliveryPage() {
  const { session, store } = await requireActiveStoreContext(Permission.CONFIGURE_DELIVERY_ZONES);
  const zones = await deliveryZoneRepo.listDeliveryZones(session.tenantId, store.id);
  const canEdit = hasTenantPermission(session.tenantRole, Permission.MANAGE_DELIVERY);

  return (
    <div>
      <PageHeader
        title="Entrega"
        description="Controle a cobertura, as taxas e os prazos exibidos no checkout."
      />
      <DeliveryZonesManager
        zones={zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          fee: zone.fee,
          minOrderValue: zone.minOrderValue,
          estimatedTime: zone.estimatedTime,
          isActive: zone.isActive,
          sortOrder: zone.sortOrder,
          updatedAt: zone.updatedAt.toISOString(),
          postalRanges: zone.postalRanges.map((range) => ({
            id: range.id,
            postalCodeStart: range.postalCodeStart,
            postalCodeEnd: range.postalCodeEnd,
          })),
        }))}
        canEdit={canEdit}
        deliveryEnabled={Boolean(store.settings?.deliveryEnabled)}
        operationSettingsHref={`/dashboard/stores/${store.id}/operations`}
      />
    </div>
  );
}
