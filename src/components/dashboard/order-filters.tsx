'use client';

import type { OrderStatus } from '@prisma/client';
import { CalendarDays, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { OrderBoardFilters } from '@/types/order-query';
import { cn } from '@/lib/utils';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export function initialOrderBoardFilters(localDate: string): OrderBoardFilters {
  return { localDate };
}

interface OrderFiltersProps {
  filters: OrderBoardFilters;
  localDate: string;
  timeZone: string;
  onChange: (filters: OrderBoardFilters) => void;
}

function sameStatuses(current: OrderStatus[] | undefined, expected: OrderStatus[] | undefined) {
  if (!current?.length && !expected?.length) return true;
  if (!current || !expected || current.length !== expected.length) return false;
  return expected.every((status) => current.includes(status));
}

const STAGE_FILTERS: Array<{ label: string; statuses?: OrderStatus[] }> = [
  { label: 'Todos' },
  { label: 'Novos', statuses: ['PENDING'] },
  { label: 'Em preparo', statuses: ['CONFIRMED', 'PREPARING'] },
  { label: 'Prontos', statuses: ['READY'] },
  { label: 'Em entrega', statuses: ['OUT_FOR_DELIVERY'] },
  { label: 'Finalizados', statuses: ['DELIVERED', 'CANCELLED'] },
];

export function OrderFilters({ filters, localDate, timeZone, onChange }: OrderFiltersProps) {
  const activeOnly = sameStatuses(filters.statuses, ACTIVE_ORDER_STATUSES);

  function update(patch: Partial<OrderBoardFilters>) {
    onChange({ ...filters, ...patch, localDate: patch.localDate ?? filters.localDate });
  }

  return (
    <section
      className="orders-toolbar border-border bg-surface rounded-xl border p-3"
      aria-label="Filtros da central de pedidos"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Filtrar por etapa">
          {STAGE_FILTERS.map((stage) => {
            const selected = sameStatuses(filters.statuses, stage.statuses);
            return (
              <Button
                key={stage.label}
                type="button"
                size="sm"
                variant={selected ? 'default' : 'ghost'}
                aria-pressed={selected}
                onClick={() => update({ statuses: stage.statuses, delayedOnly: false })}
                className={cn(!selected && 'text-text-secondary')}
              >
                {stage.label}
              </Button>
            );
          })}
        </div>

        <label className="text-text-primary flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
          <span>Somente em andamento</span>
          <Switch
            checked={activeOnly}
            onCheckedChange={(checked) =>
              update({
                statuses: checked ? ACTIVE_ORDER_STATUSES : undefined,
                delayedOnly: false,
              })
            }
            aria-label="Mostrar somente pedidos em andamento"
          />
        </label>
      </div>

      <div className="border-border mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
        <div className="min-w-40 flex-1 sm:max-w-52">
          <label
            htmlFor="orders-payment-filter"
            className="text-text-secondary mb-1 block text-xs font-medium"
          >
            Pagamento
          </label>
          <select
            id="orders-payment-filter"
            value={filters.paymentStatus ?? ''}
            onChange={(event) =>
              update({
                paymentStatus: event.target.value
                  ? (event.target.value as OrderBoardFilters['paymentStatus'])
                  : undefined,
              })
            }
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-10 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="CUSTOMER_REPORTED_PAID">Informado pelo cliente</option>
            <option value="PAID">Pago</option>
            <option value="FAILED">Falhou</option>
            <option value="REFUNDED">Reembolsado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>

        <div className="min-w-40 flex-1 sm:max-w-48">
          <label
            htmlFor="orders-modality-filter"
            className="text-text-secondary mb-1 block text-xs font-medium"
          >
            Recebimento
          </label>
          <select
            id="orders-modality-filter"
            value={filters.modality ?? ''}
            onChange={(event) =>
              update({
                modality: event.target.value
                  ? (event.target.value as OrderBoardFilters['modality'])
                  : undefined,
              })
            }
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-10 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Todos</option>
            <option value="DELIVERY">Entrega</option>
            <option value="PICKUP">Retirada</option>
          </select>
        </div>

        <div className="min-w-44 flex-1 sm:max-w-52">
          <label
            htmlFor="orders-date"
            className="text-text-secondary mb-1 block text-xs font-medium"
          >
            Finalizados em
          </label>
          <div className="relative">
            <CalendarDays
              className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="orders-date"
              type="date"
              value={filters.localDate}
              onChange={(event) => update({ localDate: event.target.value || localDate })}
              className="h-10 pl-9"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(initialOrderBoardFilters(localDate))}
          className="text-text-secondary"
        >
          <SlidersHorizontal aria-hidden="true" /> Limpar filtros
        </Button>
      </div>
      <p className="sr-only">Datas e métricas usam o fuso {timeZone}.</p>
    </section>
  );
}
