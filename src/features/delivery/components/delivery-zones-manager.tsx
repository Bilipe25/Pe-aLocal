'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/utils';
import { deleteDeliveryZoneAction } from '@/features/delivery/actions';
import { DeliveryZoneForm, type DeliveryZoneData } from './delivery-zone-form';

export function DeliveryZonesManager({ zones }: { zones: DeliveryZoneData[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(zones.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(zone: DeliveryZoneData) {
    const result = await deleteDeliveryZoneAction(zone.id);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(`Zona “${zone.name}” excluída.`);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Regiões atendidas</h2>
          <p className="mt-1 text-sm text-text-secondary">Defina taxa, pedido mínimo e prazo para cada região.</p>
        </div>
        {!creating && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nova zona
          </Button>
        )}
      </div>

      {creating && (
        <section className="rounded-xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="new-zone-heading">
          <h3 id="new-zone-heading" className="mb-4 font-semibold text-text-primary">Adicionar zona</h3>
          <DeliveryZoneForm onCancel={zones.length ? () => setCreating(false) : undefined} onSaved={() => setCreating(false)} />
        </section>
      )}

      {zones.length === 0 && !creating ? (
        <EmptyState
          icon={<Truck aria-hidden="true" />}
          title="Nenhuma zona de entrega"
          description="Adicione a primeira região para disponibilizar entregas no checkout."
        />
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <section key={zone.id} className="rounded-xl border border-border bg-surface">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-text-primary">{zone.name}</h3>
                    <Badge variant={zone.isActive ? 'success' : 'secondary'}>
                      {zone.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {formatCurrency(zone.fee)}
                    {zone.estimatedTime ? ` · ${zone.estimatedTime}` : ''}
                    {zone.minOrderValue ? ` · mínimo ${formatCurrency(zone.minOrderValue)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingId(zone.id)}>
                    <Pencil aria-hidden="true" /> Editar
                  </Button>
                  <ConfirmDialog
                    title={`Excluir “${zone.name}”?`}
                    description="A região deixará de aparecer como opção de entrega. Pedidos existentes não serão alterados."
                    confirmLabel="Excluir zona"
                    destructive
                    onConfirm={() => handleDelete(zone)}
                    trigger={
                      <Button type="button" variant="ghost" className="text-error hover:bg-error-light hover:text-error">
                        <Trash2 aria-hidden="true" /> Excluir
                      </Button>
                    }
                  />
                </div>
              </div>
              {editingId === zone.id && (
                <div className="border-t border-border p-4 sm:p-5">
                  <DeliveryZoneForm zone={zone} onCancel={() => setEditingId(null)} onSaved={() => setEditingId(null)} />
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
