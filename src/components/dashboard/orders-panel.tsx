'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BellRing, ChevronRight, ExternalLink, PackageOpen, RefreshCw } from 'lucide-react';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  orderQueryKeys,
  orderPollingInterval,
  useOrderBoard,
  useOrderBoardTemporalSummary,
  useOrderNotificationSignals,
} from '@/hooks/use-orders';
import { useOrderNotificationSound } from '@/hooks/use-order-notification-sound';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import { collectOrderSignals, type IncomingOrderSignal } from '@/lib/orders/order-notifications';
import { getNextStoreMidnight, getStoreLocalDate } from '@/lib/time/store-time';
import { cn } from '@/lib/utils';
import { getOrderBoardLaneAction } from '@/features/orders/query-actions';
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_BOARD_LANE_PAGE_SIZE,
  ORDER_FINISHED_STATUSES,
} from '@/features/orders/query-constants';
import type {
  OrderBoardFilters,
  OrderBoardLaneKey,
  OrderBoardSnapshotDTO,
  OrderNotificationSignalsDTO,
  OrderQueueItemDTO,
} from '@/types/order-query';
import { OrderCard } from './order-card';
import { OrderCardPrimaryAction } from './order-card-primary-action';
import { OrderLaneLoadMoreButton } from './order-lane-load-more-button';
import {
  appendLanePage,
  emptyLanePagination,
  laneCursorForPagination,
  lanePaginationForRevision,
  resetChangedLanePages,
  type LanePaginationState,
} from './order-board-pagination';
import {
  getAdvancedFilterCount,
  initialOrderBoardFilters,
  OrderBoardViewTabs,
  OrderFilters,
} from './order-filters';
import {
  OrderBoardMetrics,
  OrderMobileStageSelector,
  type ActiveOrderBoardLaneKey,
} from './order-board-metrics';
import { useDashboardOperations } from './dashboard-operations-context';
import { requestMerchantPushReconciliation } from './store-push-subscription';

const OrderDetailModal = dynamic(
  () => import('./order-detail-modal').then((module) => module.OrderDetailModal),
  { ssr: false },
);

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

const ACTIVE_LANE_DEFINITIONS: Array<{
  key: OrderBoardLaneKey;
  title: string;
  description: string;
  tone: string;
}> = [
  {
    key: 'NEW',
    title: 'Novos pedidos',
    description: 'Aguardando aceite',
    tone: 'orders-lane-new',
  },
  {
    key: 'PREPARATION',
    title: 'Em preparo',
    description: 'Confirmados e na cozinha',
    tone: 'orders-lane-preparation',
  },
  {
    key: 'READY_AND_DELIVERY',
    title: 'Prontos e em rota',
    description: 'Saída e entrega',
    tone: 'orders-lane-ready',
  },
];

const FINISHED_LANE_DEFINITION = {
  key: 'FINISHED' as const,
  title: 'Histórico do dia',
  description: 'Concluídos e cancelados',
  tone: 'orders-lane-finished',
};

function sameStatuses(current: OrderStatus[] | undefined, expected: OrderStatus[]) {
  return (
    current?.length === expected.length && expected.every((status) => current.includes(status))
  );
}

function isHistoryStatusFilter(statuses: OrderStatus[] | undefined) {
  return Boolean(
    statuses?.length && statuses.every((status) => ORDER_FINISHED_STATUSES.includes(status)),
  );
}

function laneFromStatuses(statuses: OrderStatus[] | undefined): ActiveOrderBoardLaneKey | null {
  if (statuses?.length === 1 && statuses[0] === 'PENDING') return 'NEW';
  if (sameStatuses(statuses, ['CONFIRMED', 'PREPARING'])) return 'PREPARATION';
  if (
    statuses?.length &&
    statuses.every((status) => status === 'READY' || status === 'OUT_FOR_DELIVERY')
  ) {
    return 'READY_AND_DELIVERY';
  }
  return null;
}

function orderCountLabel(count: number) {
  return `${count} ${count === 1 ? 'pedido' : 'pedidos'}`;
}

function validLocalDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}

function filtersFromUrl(searchParams: URLSearchParams, localDate: string): OrderBoardFilters {
  const statuses = searchParams
    .get('statuses')
    ?.split(',')
    .filter((status): status is OrderStatus => ALL_STATUSES.includes(status as OrderStatus));
  const rawPayment = searchParams.get('paymentStatus');
  const rawModality = searchParams.get('modality');
  const resolvedStatuses = statuses?.length ? statuses : [...ORDER_ACTIVE_STATUSES];

  return {
    localDate: validLocalDate(searchParams.get('date')) ?? localDate,
    statuses: resolvedStatuses,
    paymentStatus:
      rawPayment && ALL_PAYMENT_STATUSES.includes(rawPayment as PaymentStatus)
        ? (rawPayment as PaymentStatus)
        : undefined,
    modality: rawModality === 'DELIVERY' || rawModality === 'PICKUP' ? rawModality : undefined,
    delayedOnly:
      !isHistoryStatusFilter(resolvedStatuses) && searchParams.get('delayed') === '1'
        ? true
        : undefined,
  };
}

function filtersToUrl(filters: OrderBoardFilters, orderId: string | null) {
  const params = new URLSearchParams();
  if (filters.localDate) params.set('date', filters.localDate);
  if (filters.statuses?.length && !sameStatuses(filters.statuses, ORDER_ACTIVE_STATUSES)) {
    params.set('statuses', filters.statuses.join(','));
  }
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.modality) params.set('modality', filters.modality);
  if (filters.delayedOnly) params.set('delayed', '1');
  if (orderId) params.set('order', orderId);
  return params.toString();
}

function isOrderId(value: string | null) {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function OrdersBoardSkeleton({ historyMode }: { historyMode: boolean }) {
  const definitions = historyMode ? [FINISHED_LANE_DEFINITION] : ACTIVE_LANE_DEFINITIONS;
  return (
    <div className="orders-board-scroll" aria-label="Carregando quadro de pedidos" role="status">
      <div className={cn('orders-board-grid', historyMode && 'orders-board-grid-history')}>
        {definitions.map((lane) => (
          <section key={lane.key} className={cn('orders-lane', lane.tone)}>
            <div className="bg-surface-tertiary h-12 animate-pulse rounded-lg" />
            <div className="mt-3 space-y-3">
              <div className="bg-surface h-44 animate-pulse rounded-xl" />
              <div className="bg-surface h-36 animate-pulse rounded-xl" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function uniqueOrders(first: OrderQueueItemDTO[], extra: OrderQueueItemDTO[]) {
  const seen = new Set<string>();
  return [...first, ...extra].filter((order) => {
    if (seen.has(order.id)) return false;
    seen.add(order.id);
    return true;
  });
}

export function OrdersPanel({
  storeId,
  storeName,
  storeSlug,
  timeZone,
  initialLocalDate,
  authorizationScope,
  notificationBaseline,
  initialBoard,
}: {
  storeId: string;
  storeName: string;
  storeSlug: string;
  timeZone: string;
  initialLocalDate: string;
  authorizationScope: string;
  notificationBaseline: OrderNotificationSignalsDTO;
  initialBoard: OrderBoardSnapshotDTO;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const operations = useDashboardOperations();
  const { search, register, reset } = operations;
  const initialFilters = useMemo(
    () => filtersFromUrl(new URLSearchParams(searchParams.toString()), initialLocalDate),
    [initialLocalDate, searchParams],
  );
  const [localDate, setLocalDate] = useState(initialLocalDate);
  const [filterState, setFilterState] = useState(() => ({
    filters: initialFilters,
    searchToken: 'none',
    revision: 0,
  }));
  const { filters, searchToken, revision: filterRevision } = filterState;
  const historyMode = isHistoryStatusFilter(filters.statuses);
  const [mobileLane, setMobileLane] = useState<ActiveOrderBoardLaneKey>(
    () => laneFromStatuses(initialFilters.statuses) ?? 'NEW',
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const orderId = searchParams.get('order');
    return isOrderId(orderId) ? orderId : null;
  });
  const selectedOrderRef = useRef<string | null>(selectedOrderId);
  const [recentNewOrders, setRecentNewOrders] = useState<
    Array<{ orderId: string; orderNumber: number }>
  >([]);
  const [lanePagination, setLanePagination] = useState<LanePaginationState>(() =>
    emptyLanePagination(0),
  );
  const notifiedOrderIds = useRef(new Set<string>());
  const pendingRefreshIds = useRef(new Set<string>());
  const refreshTimeout = useRef<number | null>(null);
  const sound = useOrderNotificationSound(`${authorizationScope}:${storeId}`);
  const soundRef = useRef(sound);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const updateFilters = useCallback((update: SetStateAction<OrderBoardFilters>) => {
    setFilterState((current) => {
      const nextFilters = typeof update === 'function' ? update(current.filters) : update;
      return {
        filters: nextFilters,
        revision: current.revision + 1,
        searchToken:
          nextFilters.query === current.filters.query
            ? current.searchToken
            : nextFilters.query
              ? crypto.randomUUID()
              : 'none',
      };
    });
  }, []);

  const boardQuery = useOrderBoard(storeId, authorizationScope, filters, searchToken, {
    filters: initialOrderBoardFilters(initialLocalDate),
    snapshot: initialBoard,
  });
  const temporalSummaryQuery = useOrderBoardTemporalSummary(
    storeId,
    authorizationScope,
    filters,
    searchToken,
  );

  const flushRefresh = useCallback(() => {
    const orderIds = [...pendingRefreshIds.current];
    pendingRefreshIds.current.clear();
    refreshTimeout.current = null;
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardStore(storeId) });
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) });
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) });
    for (const orderId of orderIds) {
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.details(storeId, authorizationScope, orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.history(storeId, authorizationScope, orderId),
      });
      void queryClient.invalidateQueries({
        queryKey: orderQueryKeys.internalNotes(storeId, authorizationScope, orderId),
      });
    }
  }, [authorizationScope, queryClient, storeId]);

  const resetChangedPagination = useCallback(
    (orderIds: string[]) => {
      if (orderIds.length === 0) return;
      setLanePagination((current) => resetChangedLanePages(current, orderIds));
    },
    [setLanePagination],
  );
  const handleOrderChanged = useCallback(
    (orderId: string) => resetChangedPagination([orderId]),
    [resetChangedPagination],
  );

  const scheduleRefresh = useCallback(
    (orderIds: string[] = []) => {
      orderIds.forEach((orderId) => pendingRefreshIds.current.add(orderId));
      resetChangedPagination(orderIds);
      if (refreshTimeout.current !== null) return;
      refreshTimeout.current = window.setTimeout(flushRefresh, 500);
    },
    [flushRefresh, resetChangedPagination],
  );

  const processSignals = useCallback(
    (signals: IncomingOrderSignal[]) => {
      const { changedOrderIds, unseenNewOrders } = collectOrderSignals(
        signals,
        notifiedOrderIds.current,
      );
      if (changedOrderIds.length) scheduleRefresh(changedOrderIds);
      if (unseenNewOrders.length) {
        setRecentNewOrders((current) => {
          const incomingIds = new Set(unseenNewOrders.map((order) => order.orderId));
          return [
            ...unseenNewOrders.toReversed(),
            ...current.filter((order) => !incomingIds.has(order.orderId)),
          ].slice(0, 5);
        });
        void soundRef.current.play();
      }
    },
    [scheduleRefresh],
  );

  const connectionState = useOrderRealtime(storeId, {
    onNewOrder: (event) => processSignals([{ ...event, isNew: true }]),
    onOrderUpdated: (event) => scheduleRefresh([event.orderId]),
    onPaymentUpdated: (event) => scheduleRefresh([event.orderId]),
  });
  const pollingInterval = orderPollingInterval(connectionState);
  useOrderNotificationSignals(
    storeId,
    authorizationScope,
    notificationBaseline,
    pollingInterval,
    processSignals,
    scheduleRefresh,
  );

  const refresh = useCallback(async () => {
    setLanePagination(emptyLanePagination(filterRevision));
    await boardQuery.refetch();
    if (selectedOrderRef.current) {
      await queryClient.invalidateQueries({
        queryKey: orderQueryKeys.details(storeId, authorizationScope, selectedOrderRef.current),
      });
    }
  }, [authorizationScope, boardQuery, filterRevision, queryClient, setLanePagination, storeId]);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const refreshFromShell = useCallback(() => void refreshRef.current(), []);
  const toggleSoundFromShell = useCallback(() => void soundRef.current.toggle(), []);
  const openLatestOrder = useCallback(() => {
    setRecentNewOrders((current) => {
      const latest = current[0];
      if (latest) setSelectedOrderId(latest.orderId);
      return latest ? current.filter((item) => item.orderId !== latest.orderId) : current;
    });
  }, [setRecentNewOrders, setSelectedOrderId]);
  const openFiltersFromShell = useCallback(
    () => setMobileFiltersOpen(true),
    [setMobileFiltersOpen],
  );
  const activeFilterCount = getAdvancedFilterCount(filters, localDate, historyMode);

  useEffect(() => {
    register({
      realtimeState: connectionState,
      recentOrderCount: recentNewOrders.length,
      activeFilterCount,
      filtersOpen: mobileFiltersOpen,
      isRefreshing: boardQuery.isFetching,
      soundEnabled: sound.enabled,
      soundActivating: sound.isActivating,
      onRefresh: refreshFromShell,
      onToggleSound: toggleSoundFromShell,
      onOpenLatestOrder: openLatestOrder,
      onOpenFilters: openFiltersFromShell,
    });
  }, [
    activeFilterCount,
    boardQuery.isFetching,
    connectionState,
    mobileFiltersOpen,
    openLatestOrder,
    openFiltersFromShell,
    recentNewOrders.length,
    refreshFromShell,
    register,
    sound.enabled,
    sound.isActivating,
    toggleSoundFromShell,
  ]);

  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    const trimmed = search.trim();
    const isOrderNumber = /^#?\d+$/.test(trimmed);
    const delay = isOrderNumber ? 250 : 400;
    const timeout = window.setTimeout(() => {
      updateFilters((current) => ({
        ...current,
        query: isOrderNumber ? trimmed : trimmed.length >= 2 ? trimmed : undefined,
      }));
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [search, updateFilters]);

  useEffect(() => {
    selectedOrderRef.current = selectedOrderId;
    const query = filtersToUrl(filters, selectedOrderId);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router, selectedOrderId]);

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
              current.localDate === previous ? { ...current, localDate: nextLocalDate } : current,
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

  useEffect(
    () => () => {
      if (refreshTimeout.current !== null) window.clearTimeout(refreshTimeout.current);
    },
    [],
  );

  async function loadMore(laneKey: OrderBoardLaneKey) {
    const revision = filterRevision;
    const lane = boardQuery.data?.lanes[laneKey];
    if (!lane) return;
    const currentPagination = lanePaginationForRevision(lanePagination, revision);
    const cursor = laneCursorForPagination(currentPagination, revision, laneKey, lane.nextCursor);
    if (!cursor || currentPagination.loadingLanes[laneKey]) return;
    setLanePagination((current) => {
      const next = lanePaginationForRevision(current, revision);
      const errorLanes = { ...next.errorLanes };
      delete errorLanes[laneKey];
      return {
        ...next,
        loadingLanes: { ...next.loadingLanes, [laneKey]: true },
        errorLanes,
      };
    });
    try {
      const result = await getOrderBoardLaneAction({
        ...filters,
        lane: laneKey,
        cursor,
        pageSize: ORDER_BOARD_LANE_PAGE_SIZE,
      });
      if (!result.success) {
        setLanePagination((current) => {
          if (current.revision !== revision) return current;
          return { ...current, errorLanes: { ...current.errorLanes, [laneKey]: true } };
        });
        return;
      }
      setLanePagination((current) =>
        appendLanePage(current, revision, laneKey, result.data.items, result.data.nextCursor),
      );
    } catch {
      setLanePagination((current) => {
        if (current.revision !== revision) return current;
        return { ...current, errorLanes: { ...current.errorLanes, [laneKey]: true } };
      });
    } finally {
      setLanePagination((current) => {
        if (current.revision !== revision) return current;
        const loadingLanes = { ...current.loadingLanes };
        delete loadingLanes[laneKey];
        return { ...current, loadingLanes };
      });
    }
  }

  function closeDetails() {
    const previousId = selectedOrderRef.current;
    setSelectedOrderId(null);
    window.requestAnimationFrame(() => {
      const target = previousId
        ? document.getElementById(`order-card-trigger-${previousId}`)
        : null;
      const fallback = document.getElementById('orders-board-region');
      (target ?? fallback)?.focus();
    });
  }

  function changeBoardView(showHistory: boolean) {
    updateFilters((current) => ({
      ...current,
      statuses: showHistory ? [...ORDER_FINISHED_STATUSES] : [...ORDER_ACTIVE_STATUSES],
      delayedOnly: false,
    }));
  }

  const activeOrderCount = boardQuery.data
    ? boardQuery.data.summary.newCount +
      boardQuery.data.summary.preparingCount +
      boardQuery.data.summary.readyCount +
      boardQuery.data.summary.deliveryCount
    : 0;
  const operationalSla =
    temporalSummaryQuery.data &&
    boardQuery.data &&
    temporalSummaryQuery.dataUpdatedAt > boardQuery.dataUpdatedAt
      ? temporalSummaryQuery.data.operationalSla
      : boardQuery.data?.operationalSla;
  const boardOrderCount = boardQuery.data
    ? historyMode
      ? boardQuery.data.lanes.FINISHED.total
      : ACTIVE_LANE_DEFINITIONS.reduce(
          (total, definition) => total + boardQuery.data.lanes[definition.key].total,
          0,
        )
    : 0;

  useEffect(() => {
    requestMerchantPushReconciliation();
  }, [boardQuery.dataUpdatedAt, boardQuery.data?.summary.newCount]);

  return (
    <div className="orders-workspace">
      <div className="orders-workspace-main">
        <header className="orders-page-heading">
          <div>
            <h1 className="text-text-primary text-2xl font-bold">Central de Pedidos</h1>
            <p className="text-text-secondary mt-1 text-sm">
              Acompanhe a operação de {storeName} em tempo real.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="orders-storefront-link shrink-0">
              <Link
                href={`/${storeSlug}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir cardápio em nova aba"
              >
                <span className="orders-storefront-link-label">Ver cardápio</span>
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </header>

        {sound.error && (
          <p className="bg-warning-light text-warning rounded-lg px-3 py-2 text-sm" role="status">
            {sound.error}
          </p>
        )}

        <OrderBoardViewTabs
          historyMode={historyMode}
          activeOrderCount={activeOrderCount}
          onChange={changeBoardView}
        />

        {boardQuery.data && !historyMode ? (
          <>
            <OrderBoardMetrics
              summary={{
                ...boardQuery.data.summary,
                delayedCount:
                  temporalSummaryQuery.data &&
                  temporalSummaryQuery.dataUpdatedAt > boardQuery.dataUpdatedAt
                    ? temporalSummaryQuery.data.delayedCount
                    : boardQuery.data.summary.delayedCount,
              }}
            />
            <OrderMobileStageSelector
              summary={boardQuery.data.summary}
              value={mobileLane}
              onChange={setMobileLane}
            />
          </>
        ) : !historyMode ? (
          <div className="bg-surface-tertiary h-16 animate-pulse rounded-xl" />
        ) : null}

        <OrderFilters
          filters={filters}
          localDate={localDate}
          timeZone={timeZone}
          historyMode={historyMode}
          mobileOpen={mobileFiltersOpen}
          onMobileOpenChange={setMobileFiltersOpen}
          onChange={updateFilters}
        />

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {boardQuery.isFetching
            ? 'Atualizando pedidos.'
            : `${boardOrderCount} ${boardOrderCount === 1 ? 'pedido encontrado' : 'pedidos encontrados'}.`}
        </p>

        {recentNewOrders.length > 0 && (
          <section
            className="orders-new-alert"
            aria-live="polite"
            aria-label="Pedidos recebidos agora"
          >
            <BellRing className="text-info shrink-0" aria-hidden="true" />
            <p className="text-text-primary min-w-0 flex-1 text-sm">
              <strong>
                {recentNewOrders.length === 1 ? 'Novo pedido recebido' : 'Novos pedidos recebidos'}
              </strong>{' '}
              <span className="text-text-secondary">
                Abra para revisar sem perder sua posição no quadro.
              </span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={openLatestOrder}>
              Abrir mais recente <ChevronRight aria-hidden="true" />
            </Button>
          </section>
        )}

        {activeOrderCount > 500 && (
          <p
            className="border-warning/40 bg-warning-light text-warning rounded-xl border px-4 py-3 text-sm"
            role="status"
          >
            A loja possui {activeOrderCount} pedidos ativos. Revise pedidos antigos e integrações
            pendentes.
          </p>
        )}

        {boardQuery.error && boardQuery.data && (
          <p
            className="border-warning/30 bg-warning-light text-warning rounded-xl border px-4 py-3 text-sm"
            role="status"
          >
            A atualização falhou. Os últimos pedidos confirmados continuam visíveis.
          </p>
        )}

        <div className="min-w-0">
          {boardQuery.isLoading ? (
            <OrdersBoardSkeleton historyMode={historyMode} />
          ) : boardQuery.error && !boardQuery.data ? (
            <div className="border-error/30 bg-error-light rounded-xl border px-4 py-10 text-center">
              <p className="text-error font-semibold">Não foi possível carregar os pedidos.</p>
              <p className="text-error mt-1 text-sm">Verifique sua conexão e tente novamente.</p>
              <Button variant="outline" className="mt-4" onClick={() => boardQuery.refetch()}>
                <RefreshCw aria-hidden="true" /> Tentar novamente
              </Button>
            </div>
          ) : boardQuery.data ? (
            <div
              id="orders-board-region"
              className="orders-board-scroll"
              role="region"
              aria-label="Quadro operacional de pedidos"
              tabIndex={0}
            >
              <div className={cn('orders-board-grid', historyMode && 'orders-board-grid-history')}>
                {(historyMode ? [FINISHED_LANE_DEFINITION] : ACTIVE_LANE_DEFINITIONS).map(
                  (definition) => {
                    const lane = boardQuery.data.lanes[definition.key];
                    const paginationIsCurrent = lanePagination.revision === filterRevision;
                    const items = uniqueOrders(
                      lane.items,
                      paginationIsCurrent ? (lanePagination.items[definition.key] ?? []) : [],
                    );
                    const nextCursor = laneCursorForPagination(
                      lanePagination,
                      filterRevision,
                      definition.key,
                      lane.nextCursor,
                    );
                    const laneIsLoading = Boolean(
                      paginationIsCurrent && lanePagination.loadingLanes[definition.key],
                    );
                    const laneHasError = Boolean(
                      paginationIsCurrent && lanePagination.errorLanes[definition.key],
                    );
                    return (
                      <section
                        key={definition.key}
                        id={`orders-lane-section-${definition.key}`}
                        data-order-lane={definition.key}
                        className={cn(
                          'orders-lane',
                          definition.tone,
                          !historyMode &&
                            definition.key !== mobileLane &&
                            'orders-lane-mobile-hidden',
                        )}
                        aria-labelledby={`orders-lane-${definition.key}`}
                      >
                        <header className="orders-lane-header">
                          <div className="min-w-0">
                            <h2
                              id={`orders-lane-${definition.key}`}
                              className="text-text-primary truncate text-sm font-bold"
                            >
                              {definition.title}
                            </h2>
                            <p className="text-text-secondary truncate text-sm">
                              {definition.description}
                            </p>
                          </div>
                          <span
                            className="orders-lane-count"
                            aria-label={orderCountLabel(lane.total)}
                          >
                            {lane.total}
                          </span>
                        </header>

                        <div className="orders-lane-list">
                          {items.length ? (
                            items.map((order) => (
                              <OrderCard
                                key={order.id}
                                order={order}
                                operationalSla={operationalSla}
                                timeZone={timeZone}
                                onClick={() => setSelectedOrderId(order.id)}
                                selected={selectedOrderId === order.id}
                                footer={
                                  <OrderCardPrimaryAction
                                    order={order}
                                    storeId={storeId}
                                    authorizationScope={authorizationScope}
                                    onOrderChanged={handleOrderChanged}
                                  />
                                }
                              />
                            ))
                          ) : (
                            <div className="orders-lane-empty">
                              <PackageOpen aria-hidden="true" />
                              <span>Tudo em dia nesta etapa.</span>
                            </div>
                          )}
                        </div>

                        {laneHasError && (
                          <p className="text-error mt-2 text-center text-sm" role="status">
                            Não foi possível carregar mais pedidos.
                          </p>
                        )}
                        {nextCursor && (
                          <OrderLaneLoadMoreButton
                            laneTitle={definition.title}
                            loadedCount={items.length}
                            totalCount={lane.total}
                            isLoading={laneIsLoading}
                            disabled={laneIsLoading}
                            onLoadMore={() => void loadMore(definition.key)}
                          />
                        )}
                      </section>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {selectedOrderId && (
        <OrderDetailModal
          orderId={selectedOrderId}
          storeId={storeId}
          authorizationScope={authorizationScope}
          timeZone={timeZone}
          open
          onOrderChanged={handleOrderChanged}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
        />
      )}
    </div>
  );
}
