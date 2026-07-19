import { PageHeader } from '@/components/shared/page-header';
import { listDeliveryZonesAction } from '@/features/delivery/actions';
import { DeliveryZonesManager } from '@/features/delivery/components/delivery-zones-manager';

export const metadata = { title: 'Zonas de entrega' };

export default async function DeliveryPage() {
  const zones = await listDeliveryZonesAction();

  return (
    <div>
      <PageHeader
        title="Zonas de entrega"
        description="Configure onde a loja entrega e quanto cada região paga."
      />
      <DeliveryZonesManager zones={zones} />
    </div>
  );
}
