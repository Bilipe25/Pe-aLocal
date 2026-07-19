'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { useOrders } from '@/hooks/use-orders';
import { usePusherConnectionState } from '@/hooks/use-pusher-connection-state';
import { cn } from '@/lib/utils';
import type { OrderWithDetails } from '@/types/order';
import { OrderCard } from './order-card';
import { initialOrderFilters, OrderFilters } from './order-filters';
import { DailyMetrics } from './daily-metrics';
import { OrderDetailModal } from './order-detail-modal';
import type { GetOrdersParams } from '@/features/orders/admin-actions';

const CONNECTION_LABELS = {
  unavailable: { label: 'Atualização manual', className: 'bg-surface-tertiary text-text-secondary', icon: WifiOff },
  connecting: { label: 'Conectando…', className: 'bg-warning-light text-warning', icon: Wifi },
  connected: { label: 'Tempo real ativo', className: 'bg-success-light text-success', icon: Wifi },
  disconnected: { label: 'Reconectando…', className: 'bg-error-light text-error', icon: WifiOff },
} as const;

const QUEUE_SECTIONS: Array<{
  key: string;
  title: string;
  description: string;
  statuses: OrderStatus[];
}> = [
  {
    key: 'attention',
    title: 'Aguardando atenção',
    description: 'Pedidos novos ou aguardando confirmação de pagamento.',
    statuses: ['PENDING', 'AWAITING_PAYMENT'],
  },
  {
    key: 'preparation',
    title: 'Em preparo',
    description: 'Pedidos aceitos que estão sendo preparados.',
    statuses: ['CONFIRMED', 'PREPARING'],
  },
  {
    key: 'fulfillment',
    title: 'Prontos para sair',
    description: 'Retiradas prontas e pedidos em rota de entrega.',
    statuses: ['READY', 'OUT_FOR_DELIVERY'],
  },
  {
    key: 'finished',
    title: 'Encerrados',
    description: 'Pedidos concluídos ou cancelados no período selecionado.',
    statuses: ['DELIVERED', 'CANCELLED'],
  },
];

function OrdersSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Carregando pedidos" role="status">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={cn('h-40 animate-pulse rounded-xl bg-surface-tertiary', index >= 2 && 'hidden md:block')} />
      ))}
    </div>
  );
}

function groupOrders(orders: OrderWithDetails[]) {
  return QUEUE_SECTIONS.map((section) => {
    const sectionOrders = orders
      .filter((order) => section.statuses.includes(order.status))
      .sort((a, b) => {
        const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return section.key === 'finished' ? -difference : difference;
      });
    return { ...section, orders: sectionOrders };
  }).filter((section) => section.orders.length > 0);
}

export function OrdersPanel({ storeId }: { storeId: string }) {
  const [filters, setFilters] = useState<GetOrdersParams>(() => initialOrderFilters());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderSnapshot, setSelectedOrderSnapshot] = useState<OrderWithDetails | null>(null);
  const [now, setNow] = useState(0);
  const todayFilters = useMemo(() => initialOrderFilters(), []);
  const connectionState = usePusherConnectionState();
  const connection = CONNECTION_LABELS[connectionState];
  const ConnectionIcon = connection.icon;

  const ordersQuery = useOrders(storeId, filters);
  const summaryQuery = useOrders(storeId, todayFilters, { subscribe: false });
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const groupedOrders = useMemo(() => groupOrders(orders), [orders]);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? selectedOrderSnapshot;

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  function selectOrder(order: OrderWithDetails) {
    setSelectedOrderId(order.id);
    setSelectedOrderSnapshot(order);
  }

  function closeDetails() {
    setSelectedOrderId(null);
    setSelectedOrderSnapshot(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Central de pedidos</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">Priorize o que precisa de atenção e acompanhe cada etapa sem perder a visão da fila.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium', connection.className)} aria-live="polite">
            <ConnectionIcon aria-hidden="true" /> {connection.label}
          </span>
          <Button variant="outline" size="icon" aria-label="Atualizar pedidos" onClick={() => Promise.all([ordersQuery.refetch(), summaryQuery.refetch()])} disabled={ordersQuery.isFetching || summaryQuery.isFetching}>
            <RefreshCw className={ordersQuery.isFetching || summaryQuery.isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <DailyMetrics orders={summaryQuery.data ?? []} isLoading={summaryQuery.isLoading} hasError={Boolean(summaryQuery.error)} />
      <OrderFilters filters={filters} onChange={setFilters} />

      <div className={cn('min-w-0 gap-5', selectedOrder && 'xl:grid xl:grid-cols-[minmax(0,1fr)_28rem]')}>
        <div className="min-w-0 space-y-7">
          {ordersQuery.isLoading ? (
            <OrdersSkeleton />
          ) : ordersQuery.error ? (
            <div className="rounded-xl border border-error/30 bg-error-light px-4 py-8 text-center">
              <p className="font-semibold text-error">Não foi possível carregar os pedidos.</p>
              <p className="mt-1 text-sm text-error">Verifique sua conexão e tente novamente.</p>
              <Button variant="outline" className="mt-4 border-error/40 text-error hover:bg-surface" onClick={() => ordersQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center">
              <p className="font-semibold text-text-primary">Nenhum pedido encontrado</p>
              <p className="mt-1 text-sm text-text-secondary">Ajuste a busca ou volte para os pedidos de hoje.</p>
              <Button variant="ghost" className="mt-3" onClick={() => setFilters(initialOrderFilters())}>Ver pedidos de hoje</Button>
            </div>
          ) : (
            groupedOrders.map((section) => (
              <section key={section.key} aria-labelledby={`orders-${section.key}`}>
                <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <h2 id={`orders-${section.key}`} className="font-semibold text-text-primary">{section.title}</h2>
                    <p className="mt-0.5 text-sm text-text-secondary">{section.description}</p>
                  </div>
                  <span className="rounded-full bg-surface-tertiary px-2.5 py-1 font-mono text-sm font-bold text-text-primary" aria-label={`${section.orders.length} pedidos`}>
                    {section.orders.length}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {section.orders.map((order) => (
                    <OrderCard key={order.id} order={order} now={now || new Date(order.createdAt).getTime()} onClick={() => selectOrder(order)} selected={selectedOrderId === order.id} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <OrderDetailModal order={selectedOrder} open={Boolean(selectedOrder)} onOpenChange={(open) => { if (!open) closeDetails(); }} />
      </div>
    </div>
  );
}
