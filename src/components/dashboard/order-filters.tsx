'use client';

import { Search } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import type { GetOrdersParams } from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function dateInputValue(date?: Date) {
  if (!date) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function initialOrderFilters(): GetOrdersParams {
  return { dateFrom: startOfToday(), dateTo: endOfToday() };
}

export function activeOrderFilters(): GetOrdersParams {
  return { statuses: ACTIVE_ORDER_STATUSES };
}

export function OrderFilters({ filters, onChange }: { filters: GetOrdersParams; onChange: (filters: GetOrdersParams) => void }) {
  const todaySelected = !filters.status && !filters.statuses?.length && dateInputValue(filters.dateFrom) === dateInputValue(startOfToday());
  const activeSelected = filters.statuses?.length === ACTIVE_ORDER_STATUSES.length
    && ACTIVE_ORDER_STATUSES.every((status) => filters.statuses?.includes(status));

  function keepQuery(next: GetOrdersParams): GetOrdersParams {
    return filters.query ? { ...next, query: filters.query } : next;
  }

  function handleDate(value: string) {
    if (!value) {
      onChange(keepQuery({}));
      return;
    }
    onChange(keepQuery({
      dateFrom: new Date(`${value}T00:00:00`),
      dateTo: new Date(`${value}T23:59:59.999`),
    }));
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar pedidos">
          <Button variant={todaySelected ? 'secondary' : 'outline'} onClick={() => onChange(keepQuery(initialOrderFilters()))} size="sm" aria-pressed={todaySelected}>
            Hoje
          </Button>
          <Button variant={activeSelected ? 'secondary' : 'outline'} onClick={() => onChange(keepQuery(activeOrderFilters()))} size="sm" aria-pressed={activeSelected}>
            Em andamento
          </Button>
          <Button variant={filters.status === 'DELIVERED' ? 'secondary' : 'outline'} onClick={() => onChange(keepQuery({ status: 'DELIVERED', dateFrom: startOfToday(), dateTo: endOfToday() }))} size="sm" aria-pressed={filters.status === 'DELIVERED'}>
            Concluídos
          </Button>
          <Button variant={filters.status === 'CANCELLED' ? 'secondary' : 'outline'} onClick={() => onChange(keepQuery({ status: 'CANCELLED', dateFrom: startOfToday(), dateTo: endOfToday() }))} size="sm" aria-pressed={filters.status === 'CANCELLED'}>
            Cancelados
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative min-w-0 sm:w-64">
            <label htmlFor="orders-search" className="sr-only">Buscar por cliente, telefone ou número</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <Input
              id="orders-search"
              type="search"
              value={filters.query ?? ''}
              onChange={(event) => onChange({ ...filters, query: event.target.value || undefined })}
              placeholder="Cliente, telefone ou pedido"
              className="pl-10"
            />
          </div>
          <div className="sm:w-44">
            <label htmlFor="orders-date" className="sr-only">Filtrar pedidos por data</label>
            <Input
              id="orders-date"
              type="date"
              value={filters.statuses?.length ? '' : dateInputValue(filters.dateFrom)}
              onChange={(event) => handleDate(event.target.value)}
              aria-label="Filtrar pedidos por data"
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        “Em andamento” inclui todos os pedidos ainda abertos, mesmo os recebidos antes de hoje.
      </p>
    </div>
  );
}
