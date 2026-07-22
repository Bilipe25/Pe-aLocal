'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BellRing, ExternalLink, RefreshCw, Volume2, VolumeX, Wifi, X } from 'lucide-react';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  orderQueryKeys,
  orderPollingInterval,
  useOrderMetrics,
  useOrderNotificationSignals,
  useOrderQueue,
} from '@/hooks/use-orders';
import { useOrderNotificationSound } from '@/hooks/use-order-notification-sound';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import { collectOrderSignals, type IncomingOrderSignal } from '@/lib/orders/order-notifications';
import { getNextStoreMidnight, getStoreLocalDate } from '@/lib/time/store-time';
import { cn } from '@/lib/utils';
import type {
  OrderNotificationSignalsDTO,
  OrderQueueFilters,
  OrderQueueItemDTO,
} from '@/types/order-query';
import { useQueryClient } from '@tanstack/react-query';
import { OrderCard } from './order-card';
import { initialOrderFilters, OrderFilters } from './order-filters';
import { DailyMetrics } from './daily-metrics';
import { OrderDetailModal } from './order-detail-modal';

const CONNECTION_LABELS = {
  unavailable: {
    label: 'Atualização automática',
    className: 'bg-info-light text-info',
    icon: RefreshCw,
  },
  connecting: { label: 'Conectando…', className: 'bg-warning-light text-warning', icon: Wifi },
  connected: { label: 'Tempo real ativo', className: 'bg-success-light text-success', icon: Wifi },
  degraded: {
    label: 'Atualização automática',
    className: 'bg-warning-light text-warning',
    icon: RefreshCw,
  },
} as const;

const ALL_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];
const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING',
  'CUSTOMER_REPORTED_PAID',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
];

const QUEUE_SECTIONS: Array<{
  key: string;
  title: string;
  description: string;
  statuses: OrderStatus[];
}> = [
  { key: 'new', title: 'Novos', description: 'Pedidos aguardando aceite.', statuses: ['PENDING'] },
  {
    key: 'preparation',
    title: 'Em preparo',
    description: 'Pedidos aceitos e em produção.',
    statuses: ['CONFIRMED', 'PREPARING'],
  },
  {
    key: 'ready',
    title: 'Prontos',
    description: 'Pedidos aguardando retirada ou despacho.',
    statuses: ['READY'],
  },
  {
    key: 'delivery',
    title: 'Em entrega',
    description: 'Pedidos em rota para o cliente.',
    statuses: ['OUT_FOR_DELIVERY'],
  },
  {
    key: 'finished',
    title: 'Encerrados',
    description: 'Pedidos concluídos ou cancelados.',
    statuses: ['DELIVERED', 'CANCELLED'],
  },
];

function OrdersSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Carregando pedidos" role="status">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'bg-surface-tertiary h-40 animate-pulse rounded-xl',
            index >= 2 && 'hidden md:block',
          )}
        />
      ))}
    </div>
  );
}

function groupOrders(orders: OrderQueueItemDTO[]) {
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

function filtersFromUrl(
  searchParams: URLSearchParams,
  localDate: string,
): Omit<OrderQueueFilters, 'cursor'> {
  const rawDate = searchParams.get('date');
  const rawStatus = searchParams.get('status');
  const rawStatuses = searchParams.get('statuses')?.split(',');
  const rawPaymentStatus = searchParams.get('paymentStatus');
  const rawModality = searchParams.get('modality');
  const validDate = (() => {
    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return undefined;
    const [year, month, day] = rawDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? rawDate
      : undefined;
  })();
  const status =
    rawStatus && ALL_STATUSES.includes(rawStatus as OrderStatus)
      ? (rawStatus as OrderStatus)
      : undefined;
  const statuses = status
    ? undefined
    : rawStatuses?.filter((value): value is OrderStatus =>
        ALL_STATUSES.includes(value as OrderStatus),
      );
  const paymentStatus =
    rawPaymentStatus && ALL_PAYMENT_STATUSES.includes(rawPaymentStatus as PaymentStatus)
      ? (rawPaymentStatus as PaymentStatus)
      : undefined;
  const modality = rawModality === 'DELIVERY' || rawModality === 'PICKUP' ? rawModality : undefined;
  if (!validDate && !status && !statuses?.length && !paymentStatus && !modality) {
    return {
      statuses: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
      pageSize: 30,
    };
  }
  const hasUndatedOperationalFilter = Boolean(status || statuses?.length);

  return {
    pageSize: 30,
    date: validDate ?? (hasUndatedOperationalFilter ? undefined : localDate),
    status,
    statuses: statuses?.length ? statuses : undefined,
    paymentStatus,
    modality,
  };
}

function filtersToUrl(filters: Omit<OrderQueueFilters, 'cursor'>, orderId: string | null) {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.status) params.set('status', filters.status);
  if (filters.statuses?.length) params.set('statuses', filters.statuses.join(','));
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.modality) params.set('modality', filters.modality);
  if (orderId) params.set('order', orderId);
  return params.toString();
}

export function OrdersPanel({
  storeId,
  storeName,
  storeSlug,
  timeZone,
  initialLocalDate,
  authorizationScope,
  notificationBaseline,
}: {
  storeId: string;
  storeName: string;
  storeSlug: string;
  timeZone: string;
  initialLocalDate: string;
  authorizationScope: string;
  notificationBaseline: OrderNotificationSignalsDTO;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [localDate, setLocalDate] = useState(initialLocalDate);
  const [filterState, setFilterState] = useState(() => ({
    filters: filtersFromUrl(new URLSearchParams(searchParams.toString()), initialLocalDate),
    searchToken: 'none',
  }));
  const { filters, searchToken } = filterState;
  const updateFilters = useCallback((update: SetStateAction<Omit<OrderQueueFilters, 'cursor'>>) => {
    setFilterState((current) => {
      const nextFilters = typeof update === 'function' ? update(current.filters) : update;
      return {
        filters: nextFilters,
        searchToken:
          nextFilters.query === current.filters.query
            ? current.searchToken
            : nextFilters.query
              ? crypto.randomUUID()
              : 'none',
      };
    });
  }, []);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const orderId = searchParams.get('order');
    return orderId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
      ? orderId
      : null;
  });
  const [now, setNow] = useState(0);
  const [recentNewOrders, setRecentNewOrders] = useState<
    Array<{
      orderId: string;
      orderNumber: number;
    }>
  >([]);
  const notifiedOrderIds = useRef(new Set<string>());
  const sound = useOrderNotificationSound(`${authorizationScope}:${storeId}`);
  const refreshStore = (orderIds: string[] = []) => {
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) });
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) });
    for (const orderId of new Set(orderIds)) {
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.details(storeId, authorizationScope, orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.history(storeId, authorizationScope, orderId),
      });
    }
  };
  const processSignals = (signals: IncomingOrderSignal[]) => {
    const { changedOrderIds, unseenNewOrders } = collectOrderSignals(
      signals,
      notifiedOrderIds.current,
    );
    if (changedOrderIds.length) refreshStore(changedOrderIds);
    if (unseenNewOrders.length) {
      setRecentNewOrders((current) => {
        const incomingIds = new Set(unseenNewOrders.map((order) => order.orderId));
        return [
          ...unseenNewOrders.toReversed(),
          ...current.filter((order) => !incomingIds.has(order.orderId)),
        ].slice(0, 5);
      });
      void sound.play();
    }
  };
  const connectionState = useOrderRealtime(storeId, {
    onNewOrder: (event) => processSignals([{ ...event, isNew: true }]),
    onOrderUpdated: (event) => refreshStore([event.orderId]),
    onPaymentUpdated: (event) => refreshStore([event.orderId]),
  });
  const connection = CONNECTION_LABELS[connectionState];
  const ConnectionIcon = connection.icon;
  const pollingInterval = orderPollingInterval(connectionState);

  const queueQuery = useOrderQueue(storeId, authorizationScope, filters, searchToken);
  const metricsQuery = useOrderMetrics(storeId, authorizationScope, localDate, pollingInterval);
  useOrderNotificationSignals(
    storeId,
    authorizationScope,
    notificationBaseline,
    pollingInterval,
    processSignals,
    () => refreshStore(),
  );
  const orders = useMemo(
    () => queueQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [queueQuery.data],
  );
  const groupedOrders = useMemo(() => groupOrders(orders), [orders]);
  const firstPage = queueQuery.data?.pages[0];
  const lastSynchronizedAt = Math.max(queueQuery.dataUpdatedAt, metricsQuery.dataUpdatedAt);

  useEffect(() => {
    const query = filtersToUrl(filters, selectedOrderId);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router, selectedOrderId]);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let timeout: number;
    const scheduleMidnight = () => {
      const currentDate = new Date();
      const nextMidnight = getNextStoreMidnight(currentDate, timeZone);
      timeout = window.setTimeout(
        () => {
          const nextLocalDate = getStoreLocalDate(new Date(), timeZone);
          setLocalDate((previous) => {
            updateFilters((current) =>
              current.date === previous ? { ...current, date: nextLocalDate } : current,
            );
            return nextLocalDate;
          });
          scheduleMidnight();
        },
        Math.max(1_000, nextMidnight.getTime() - currentDate.getTime() + 1_000),
      );
    };
    scheduleMidnight();
    return () => window.clearTimeout(timeout);
  }, [timeZone, updateFilters]);

  async function refresh() {
    await Promise.all([
      queueQuery.refetch(),
      metricsQuery.refetch(),
      selectedOrderId
        ? queryClient.invalidateQueries({
            queryKey: orderQueryKeys.details(storeId, authorizationScope, selectedOrderId),
          })
        : Promise.resolve(),
    ]);
  }

  const hasOrders = orders.length > 0;
  const showBlockingError = Boolean(queueQuery.error && !hasOrders);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-text-primary text-2xl font-bold">Central de pedidos</h1>
          <p className="text-text-secondary mt-1 max-w-2xl text-sm">
            {storeName} · operação no fuso {timeZone}
          </p>
          <p className="text-text-secondary mt-1 text-xs" aria-live="polite">
            {lastSynchronizedAt
              ? `Última sincronização às ${new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(lastSynchronizedAt))}`
              : 'Sincronizando pedidos…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium',
              connection.className,
            )}
            aria-live="polite"
          >
            <ConnectionIcon aria-hidden="true" /> {connection.label}
          </span>
          <Button
            variant="outline"
            className="gap-2"
            aria-pressed={sound.enabled}
            onClick={() => void sound.toggle()}
            disabled={sound.isActivating}
          >
            {sound.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            {sound.isActivating ? 'Ativando…' : sound.enabled ? 'Som ligado' : 'Ativar som'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Atualizar pedidos"
            onClick={refresh}
            disabled={queueQuery.isFetching || metricsQuery.isFetching}
          >
            <RefreshCw
              className={
                queueQuery.isFetching || metricsQuery.isFetching ? 'animate-spin' : undefined
              }
              aria-hidden="true"
            />
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link href={`/${storeSlug}`} target="_blank" rel="noreferrer">
              Ver cardápio <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {sound.error && (
        <p className="text-warning -mt-3 text-sm" role="status">
          {sound.error}
        </p>
      )}

      <DailyMetrics
        metrics={metricsQuery.data}
        isLoading={metricsQuery.isLoading}
        hasError={Boolean(metricsQuery.error)}
      />
      <OrderFilters
        key={filters.query ?? 'no-query'}
        filters={filters}
        localDate={localDate}
        timeZone={timeZone}
        onChange={updateFilters}
      />

      {recentNewOrders.length > 0 && (
        <section
          className="border-info/30 bg-info-light flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Pedidos recebidos agora"
          aria-live="polite"
        >
          <div className="flex min-w-0 items-start gap-3">
            <BellRing className="text-info mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-text-primary font-semibold">
                {recentNewOrders.length === 1 ? 'Novo pedido recebido' : 'Novos pedidos recebidos'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recentNewOrders.map((order) => (
                  <Button
                    key={order.orderId}
                    variant="outline"
                    size="sm"
                    className="bg-surface font-mono"
                    onClick={() => {
                      setSelectedOrderId(order.orderId);
                      setRecentNewOrders((current) =>
                        current.filter((item) => item.orderId !== order.orderId),
                      );
                    }}
                  >
                    Abrir #{order.orderNumber}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 self-end sm:self-auto"
            aria-label="Dispensar avisos de novos pedidos"
            onClick={() => setRecentNewOrders([])}
          >
            <X aria-hidden="true" />
          </Button>
        </section>
      )}

      {firstPage?.hasAbnormalActiveVolume && (
        <div
          className="border-warning/40 bg-warning-light text-warning rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          A loja possui {firstPage.activeOrderCount} pedidos ativos. Revise pedidos antigos e
          possíveis integrações pendentes.
        </div>
      )}
      {queueQuery.error && hasOrders && (
        <div
          className="border-warning/30 bg-warning-light text-warning rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          A última atualização falhou. Os pedidos carregados continuam visíveis.
        </div>
      )}

      <div
        className={cn(
          'min-w-0 gap-5',
          selectedOrderId && 'xl:grid xl:grid-cols-[minmax(0,1fr)_28rem]',
        )}
      >
        <div className="min-w-0 space-y-7">
          {queueQuery.isLoading ? (
            <OrdersSkeleton />
          ) : showBlockingError ? (
            <div className="border-error/30 bg-error-light rounded-xl border px-4 py-8 text-center">
              <p className="text-error font-semibold">Não foi possível carregar os pedidos.</p>
              <p className="text-error mt-1 text-sm">Verifique sua conexão e tente novamente.</p>
              <Button
                variant="outline"
                className="border-error/40 text-error hover:bg-surface mt-4"
                onClick={() => queueQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !hasOrders ? (
            <div className="border-border bg-surface rounded-xl border border-dashed px-4 py-10 text-center">
              <p className="text-text-primary font-semibold">Nenhum pedido encontrado</p>
              <p className="text-text-secondary mt-1 text-sm">
                Ajuste a busca ou volte para os pedidos do dia da loja.
              </p>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => updateFilters(initialOrderFilters(localDate))}
              >
                Ver pedidos de hoje
              </Button>
            </div>
          ) : (
            <>
              {groupedOrders.map((section) => (
                <section key={section.key} aria-labelledby={`orders-${section.key}`}>
                  <div className="border-border mb-3 flex items-start justify-between gap-3 border-b pb-3">
                    <div>
                      <h2 id={`orders-${section.key}`} className="text-text-primary font-semibold">
                        {section.title}
                      </h2>
                      <p className="text-text-secondary mt-0.5 text-sm">{section.description}</p>
                    </div>
                    <span
                      className="bg-surface-tertiary text-text-primary rounded-full px-2.5 py-1 font-mono text-sm font-bold"
                      aria-label={`${section.orders.length} pedidos carregados`}
                    >
                      {section.orders.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {section.orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        now={now || new Date(order.stageStartedAt).getTime()}
                        onClick={() => setSelectedOrderId(order.id)}
                        selected={selectedOrderId === order.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {queueQuery.hasNextPage && (
                <div className="border-border flex justify-center border-t pt-5">
                  <Button
                    variant="outline"
                    onClick={() => queueQuery.fetchNextPage()}
                    disabled={queueQuery.isFetchingNextPage}
                  >
                    {queueQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais pedidos'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <OrderDetailModal
          orderId={selectedOrderId}
          storeId={storeId}
          authorizationScope={authorizationScope}
          timeZone={timeZone}
          open={Boolean(selectedOrderId)}
          onOpenChange={(open) => {
            if (!open) setSelectedOrderId(null);
          }}
        />
      </div>
    </div>
  );
}
