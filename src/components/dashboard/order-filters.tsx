'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, ChevronDown, History, ListChecks, SlidersHorizontal, X } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ORDER_ACTIVE_STATUSES, ORDER_FINISHED_STATUSES } from '@/features/orders/query-constants';
import type { OrderBoardFilters } from '@/types/order-query';
import { cn } from '@/lib/utils';

export function initialOrderBoardFilters(localDate: string): OrderBoardFilters {
  return { localDate, statuses: [...ORDER_ACTIVE_STATUSES] };
}

interface OrderFiltersProps {
  filters: OrderBoardFilters;
  localDate: string;
  timeZone: string;
  historyMode: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onChange: (filters: OrderBoardFilters) => void;
}

export function getAdvancedFilterCount(
  filters: OrderBoardFilters,
  localDate: string,
  historyMode: boolean,
) {
  return [
    filters.paymentStatus,
    filters.modality,
    !historyMode && filters.delayedOnly,
    historyMode && filters.localDate !== localDate,
  ].filter(Boolean).length;
}

export function OrderBoardViewTabs({
  historyMode,
  activeOrderCount,
  onChange,
}: {
  historyMode: boolean;
  activeOrderCount: number;
  onChange: (historyMode: boolean) => void;
}) {
  return (
    <nav className="orders-view-tabs" aria-label="Visualização dos pedidos">
      <button
        type="button"
        className="orders-view-tab"
        aria-current={!historyMode ? 'page' : undefined}
        onClick={() => onChange(false)}
      >
        <ListChecks aria-hidden="true" />
        Em andamento
        <span
          className="orders-view-tab-count"
          aria-label={`${activeOrderCount} ${activeOrderCount === 1 ? 'pedido ativo' : 'pedidos ativos'}`}
        >
          {activeOrderCount}
        </span>
      </button>
      <button
        type="button"
        className="orders-view-tab"
        aria-current={historyMode ? 'page' : undefined}
        onClick={() => onChange(true)}
      >
        <History aria-hidden="true" />
        Histórico
      </button>
    </nav>
  );
}

interface OrderFilterFieldsProps {
  idPrefix: string;
  filters: OrderBoardFilters;
  localDate: string;
  historyMode: boolean;
  filterCount: number;
  onUpdate: (patch: Partial<OrderBoardFilters>) => void;
  onClear: () => void;
  className: string;
}

function OrderFilterFields({
  idPrefix,
  filters,
  localDate,
  historyMode,
  filterCount,
  onUpdate,
  onClear,
  className,
}: OrderFilterFieldsProps) {
  const paymentId = `${idPrefix}-payment`;
  const modalityId = `${idPrefix}-modality`;
  const dateId = `${idPrefix}-date`;

  return (
    <div className={className}>
      <div className="min-w-40 flex-1 sm:max-w-52">
        <label htmlFor={paymentId} className="text-text-secondary mb-1 block text-xs font-medium">
          Pagamento
        </label>
        <select
          id={paymentId}
          value={filters.paymentStatus ?? ''}
          onChange={(event) =>
            onUpdate({
              paymentStatus: event.target.value
                ? (event.target.value as OrderBoardFilters['paymentStatus'])
                : undefined,
            })
          }
          className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
        <label htmlFor={modalityId} className="text-text-secondary mb-1 block text-xs font-medium">
          Recebimento
        </label>
        <select
          id={modalityId}
          value={filters.modality ?? ''}
          onChange={(event) =>
            onUpdate({
              modality: event.target.value
                ? (event.target.value as OrderBoardFilters['modality'])
                : undefined,
            })
          }
          className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <option value="">Todos</option>
          <option value="DELIVERY">Entrega</option>
          <option value="PICKUP">Retirada</option>
          <option value="DINE_IN">Salão</option>
        </select>
      </div>

      {historyMode ? (
        <div className="min-w-44 flex-1 sm:max-w-52">
          <label htmlFor={dateId} className="text-text-secondary mb-1 block text-xs font-medium">
            Finalizados em
          </label>
          <div className="relative">
            <CalendarDays
              className="text-text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id={dateId}
              type="date"
              value={filters.localDate}
              onChange={(event) => onUpdate({ localDate: event.target.value || localDate })}
              className="h-11 pl-9"
            />
          </div>
        </div>
      ) : (
        <label className="text-text-primary flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium sm:self-end">
          <Switch
            checked={Boolean(filters.delayedOnly)}
            onCheckedChange={(checked) => onUpdate({ delayedOnly: checked || undefined })}
            aria-label="Mostrar somente pedidos que precisam de atenção"
          />
          <span>Somente com atenção</span>
        </label>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={filterCount === 0}
        className={cn('text-text-secondary sm:self-end', filterCount === 0 && 'opacity-60')}
      >
        Limpar filtros
      </Button>
    </div>
  );
}

export function OrderFilters({
  filters,
  localDate,
  timeZone,
  historyMode,
  mobileOpen,
  onMobileOpenChange,
  onChange,
}: OrderFiltersProps) {
  const filterCount = getAdvancedFilterCount(filters, localDate, historyMode);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const desktopQuery = window.matchMedia('(min-width: 80rem)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onMobileOpenChange(false);
    };

    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, [onMobileOpenChange]);

  function update(patch: Partial<OrderBoardFilters>) {
    onChange({ ...filters, ...patch, localDate: patch.localDate ?? filters.localDate });
  }

  function clearFilters() {
    onChange({
      localDate,
      statuses: historyMode ? [...ORDER_FINISHED_STATUSES] : [...ORDER_ACTIVE_STATUSES],
    });
  }

  return (
    <>
      <details
        className="orders-toolbar hidden xl:block"
        aria-label="Filtros da central de pedidos"
      >
        <summary className="orders-toolbar-summary">
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal aria-hidden="true" />
            <span>Filtros avançados</span>
            {filterCount > 0 ? (
              <span
                className="orders-filter-count"
                aria-label={`${filterCount} ${filterCount === 1 ? 'filtro ativo' : 'filtros ativos'}`}
              >
                {filterCount}
              </span>
            ) : null}
          </span>
          <ChevronDown className="orders-toolbar-chevron" aria-hidden="true" />
        </summary>
        <OrderFilterFields
          idPrefix="orders-inline-filter"
          filters={filters}
          localDate={localDate}
          historyMode={historyMode}
          filterCount={filterCount}
          onUpdate={update}
          onClear={clearFilters}
          className="orders-toolbar-fields"
        />
        <p className="sr-only">Datas e métricas usam o fuso {timeZone}.</p>
      </details>

      <Dialog.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="orders-filter-sheet-overlay bg-tinta/50 fixed inset-0 z-40" />
          <Dialog.Content
            id="orders-mobile-filter-sheet"
            className="orders-filter-sheet bg-surface border-border fixed right-0 bottom-0 left-0 z-50 mx-auto w-full max-w-xl overflow-y-auto rounded-t-2xl border border-b-0 px-4 pt-2 shadow-lg focus:outline-none"
            style={{
              maxHeight: 'min(85dvh, 42rem)',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
            aria-describedby="orders-mobile-filter-description"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('orders-mobile-filter-payment')?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById('orders-mobile-filter-trigger')?.focus();
            }}
          >
            <div className="orders-filter-sheet-handle" aria-hidden="true" />
            <header className="orders-filter-sheet-header">
              <div>
                <Dialog.Title className="text-text-primary text-lg font-bold">
                  Filtros avançados
                </Dialog.Title>
                <Dialog.Description
                  id="orders-mobile-filter-description"
                  className="text-text-secondary mt-0.5 text-sm"
                >
                  Refine os pedidos exibidos nesta etapa.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar filtros">
                  <X aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>

            <OrderFilterFields
              idPrefix="orders-mobile-filter"
              filters={filters}
              localDate={localDate}
              historyMode={historyMode}
              filterCount={filterCount}
              onUpdate={update}
              onClear={clearFilters}
              className="orders-filter-sheet-fields"
            />

            <footer className="orders-filter-sheet-footer">
              <Dialog.Close asChild>
                <Button type="button" className="w-full">
                  Ver pedidos
                </Button>
              </Dialog.Close>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
