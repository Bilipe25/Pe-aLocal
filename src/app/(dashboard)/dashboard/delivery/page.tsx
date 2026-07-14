import { Truck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { listDeliveryZonesAction } from '@/features/delivery/actions';
import { formatCurrency } from '@/lib/utils';
import { DeliveryZoneForm } from '@/features/delivery/components/delivery-zone-form';

export const metadata = { title: 'Zonas de Entrega' };

export default async function DeliveryPage() {
  const zones = await listDeliveryZonesAction();

  return (
    <div>
      <PageHeader
        title="Zonas de Entrega"
        description="Configure bairros, taxas e tempos de entrega."
        backHref="/dashboard"
      />

      {/* Formulário inline para criar nova zona */}
      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold text-text-primary">Adicionar zona</h2>
        <DeliveryZoneForm />
      </div>

      {zones.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title="Nenhuma zona de entrega"
          description="Adicione bairros e taxas de entrega acima."
        />
      ) : (
        <div className="space-y-2">
          {zones.map((zone) => (
            <div key={zone.id} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
              <div>
                <p className="font-medium text-text-primary">{zone.name}</p>
                <p className="text-sm text-text-secondary">
                  Taxa: {formatCurrency(zone.fee)}
                  {zone.estimatedTime && ` · ${zone.estimatedTime}`}
                </p>
              </div>
              <Badge variant={zone.isActive ? 'success' : 'secondary'}>
                {zone.isActive ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
