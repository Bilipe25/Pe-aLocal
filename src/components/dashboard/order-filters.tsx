'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Search } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OrderQueueFilters } from '@/types/order-query';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
];

export function initialOrderFilters(localDate: string): Omit<OrderQueueFilters, 'cursor'> {
  return { date: localDate, pageSize: 30 };
}

export function activeOrderFilters(): Omit<OrderQueueFilters, 'cursor'> {
  return { statuses: ACTIVE_ORDER_STATUSES, pageSize: 30 };
}

interface OrderFiltersProps {
  filters: Omit<OrderQueueFilters, 'cursor'>;
  localDate: string;
  timeZone: string;
  onChange: Dispatch<SetStateAction<Omit<OrderQueueFilters, 'cursor'>>>;
}

export function OrderFilters({
  filters,
  localDate,
  timeZone,
  onChange,
}: OrderFiltersProps) {
  const [search, setSearch] = useState(filters.query ?? '');

  useEffect(() => {
    const trimmed = search.trim();
    if (/^#?\d+$/.test(trimmed)) {
      onChange((current) => ({ ...current, query: trimmed || undefined }));
      return;
    }

    const timeout = window.setTimeout(() => {
      onChange((current) => ({
        ...current,
        query: trimmed.length >= 2 ? trimmed : undefined,
      }));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [onChange, search]);

  function keepQuery(next: Omit<OrderQueueFilters, 'cursor'>) {
    return filters.query ? { ...next, query: filters.query } : next;
  }

  const activeSelected =
    filters.statuses?.length === ACTIVE_ORDER_STATUSES.length &&
    ACTIVE_ORDER_STATUSES.every((status) => filters.statuses?.includes(status));

  const presets: Array<{
    label: string;
    selected: boolean;
    filters: Omit<OrderQueueFilters, 'cursor'>;
  }> = [
    {
      label: 'Hoje',
      selected: filters.date === localDate && !filters.status && !filters.statuses?.length && !filters.paymentStatus,
      filters: initialOrderFilters(localDate),
    },
    { label: 'Em andamento', selected: Boolean(activeSelected), filters: activeOrderFilters() },
    {
      label: 'Novos',
      selected: filters.status === 'PENDING',
      filters: { status: 'PENDING', pageSize: 30 },
    },
    {
      label: 'Pagamento pendente',
      selected: filters.paymentStatus === 'PENDING',
      filters: { paymentStatus: 'PENDING', date: localDate, pageSize: 30 },
    },
    {
      label: 'Em preparo',
      selected: filters.statuses?.length === 2 && filters.statuses.includes('CONFIRMED') && filters.statuses.includes('PREPARING'),
      filters: { statuses: ['CONFIRMED', 'PREPARING'], pageSize: 30 },
    },
    {
      label: 'Prontos',
      selected: filters.status === 'READY',
      filters: { status: 'READY', pageSize: 30 },
    },
    {
      label: 'Concluídos',
      selected: filters.status === 'DELIVERED',
      filters: { status: 'DELIVERED', date: localDate, pageSize: 30 },
    },
    {
      label: 'Cancelados',
      selected: filters.status === 'CANCELLED',
      filters: { status: 'CANCELLED', date: localDate, pageSize: 30 },
    },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar pedidos">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant={preset.selected ? 'secondary' : 'outline'}
            onClick={() => onChange(keepQuery(preset.filters))}
            size="sm"
            aria-pressed={preset.selected}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <label htmlFor="orders-search" className="mb-1.5 block text-sm font-medium text-text-primary">
            Buscar pedidos
          </label>
          <Search className="pointer-events-none absolute bottom-3 left-3 text-text-muted" aria-hidden="true" />
          <Input
            id="orders-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Número, cliente, telefone ou pagamento"
            className="pl-10"
          />
        </div>
        <div className="sm:w-48">
          <label htmlFor="orders-date" className="mb-1.5 block text-sm font-medium text-text-primary">
            Data da loja
          </label>
          <Input
            id="orders-date"
            type="date"
            value={filters.date ?? ''}
            onChange={(event) =>
              onChange(
                keepQuery({
                  date: event.target.value || undefined,
                  pageSize: filters.pageSize,
                }),
              )
            }
          />
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        Datas e métricas seguem o fuso da loja: {timeZone}.
      </p>
    </div>
  );
}
