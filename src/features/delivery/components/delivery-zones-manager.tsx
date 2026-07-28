'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, MapPin, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatCurrency } from '@/lib/utils';
import { deleteDeliveryZoneAction } from '@/features/delivery/actions';
import { DeliveryZoneForm, type DeliveryZoneData } from './delivery-zone-form';

export function DeliveryZonesManager({
  zones,
  canEdit,
}: {
  zones: DeliveryZoneData[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(canEdit && zones.length === 0);
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
          <h2 className="text-text-primary text-lg font-semibold">Regiões atendidas</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Defina taxa, pedido mínimo e prazo para cada região.
          </p>
        </div>
        {canEdit && !creating && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Nova zona
          </Button>
        )}
      </div>

      {creating && (
        <section
          className="border-border bg-surface rounded-xl border p-4 sm:p-5"
          aria-labelledby="new-zone-heading"
        >
          <h3 id="new-zone-heading" className="text-text-primary mb-4 font-semibold">
            Adicionar zona
          </h3>
          <DeliveryZoneForm
            onCancel={zones.length ? () => setCreating(false) : undefined}
            onSaved={() => setCreating(false)}
          />
        </section>
      )}

      {!canEdit && (
        <div className="border-info/25 bg-info-light text-text-primary flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Eye className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Seu perfil pode consultar zonas, taxas e faixas de CEP. Somente o proprietário pode
            alterar esta configuração comercial.
          </p>
        </div>
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
            <section key={zone.id} className="border-border bg-surface rounded-xl border">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-text-primary font-semibold">{zone.name}</h3>
                    <Badge variant={zone.isActive ? 'success' : 'secondary'}>
                      {zone.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-1 text-sm">
                    {formatCurrency(zone.fee)}
                    {zone.estimatedTime ? ` · ${zone.estimatedTime}` : ''}
                    {zone.minOrderValue ? ` · mínimo ${formatCurrency(zone.minOrderValue)}` : ''}
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {zone.postalRanges.map((range) => (
                      <li
                        key={range.id}
                        className="bg-surface-secondary text-text-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                      >
                        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="font-mono">
                          {range.postalCodeStart.replace(/^(\d{5})(\d{3})$/, '$1-$2')} a{' '}
                          {range.postalCodeEnd.replace(/^(\d{5})(\d{3})$/, '$1-$2')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {canEdit && (
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
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-error hover:bg-error-light hover:text-error"
                        >
                          <Trash2 aria-hidden="true" /> Excluir
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
              {canEdit && editingId === zone.id && (
                <div className="border-border border-t p-4 sm:p-5">
                  <DeliveryZoneForm
                    zone={zone}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
