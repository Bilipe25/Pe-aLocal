'use client';

import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';

import {
  getDailyOrderMetricsAction,
  getOrderDetailsAction,
  getOrderHistoryAction,
  getOrderNotificationSignalsAction,
  getOrderQueueAction,
} from '@/features/orders/query-actions';
import type { OrderRealtimeState } from '@/hooks/use-order-realtime';
import type { OrderNotificationSignalsDTO, OrderQueueFilters } from '@/types/order-query';
import { useEffect, useEffectEvent } from 'react';

export const orderQueryKeys = {
  queue: (
    storeId: string | null,
    authorizationScope: string,
    filters: Omit<OrderQueueFilters, 'cursor'>,
    searchToken = 'none',
  ) => ['order-queue', storeId, authorizationScope, safeFilterKey(filters), searchToken] as const,
  queueStore: (storeId: string | null) => ['order-queue', storeId] as const,
  details: (storeId: string | null, authorizationScope: string, orderId: string | null) =>
    ['order-details', storeId, authorizationScope, orderId] as const,
  history: (storeId: string | null, authorizationScope: string, orderId: string | null) =>
    ['order-history', storeId, authorizationScope, orderId] as const,
  metrics: (storeId: string | null, authorizationScope: string, localDate: string) =>
    ['order-metrics', storeId, authorizationScope, localDate] as const,
  metricsStore: (storeId: string | null) => ['order-metrics', storeId] as const,
  notifications: (storeId: string | null, authorizationScope: string) =>
    ['order-notification-signals', storeId, authorizationScope] as const,
};

export function orderPollingInterval(state: OrderRealtimeState) {
  return state === 'connected' ? 60_000 : 20_000;
}

function safeFilterKey(filters: Omit<OrderQueueFilters, 'cursor'>) {
  const safeFilters = { ...filters };
  delete safeFilters.query;
  return safeFilters;
}

function actionData<T>(result: { success: true; data: T } | { success: false; error: { message: string } }): T {
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

export function useOrderQueue(
  storeId: string | null,
  authorizationScope: string,
  filters: Omit<OrderQueueFilters, 'cursor'>,
  searchToken = 'none',
) {
  const queryKey = orderQueryKeys.queue(storeId, authorizationScope, filters, searchToken);
  return useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      const result = await getOrderQueueAction({ ...filters, cursor: pageParam ?? undefined });
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return actionData(result);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(storeId),
    staleTime: 15_000,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useOrderNotificationSignals(
  storeId: string | null,
  authorizationScope: string,
  initialBaseline: OrderNotificationSignalsDTO,
  pollingInterval: number,
  onSignals: (signals: Array<{
    eventId: string;
    orderId: string;
    orderNumber: number;
    isNew: boolean;
  }>) => void,
  onReconcileRequired: () => void,
) {
  const emitSignals = useEffectEvent(onSignals);
  const reconcile = useEffectEvent(onReconcileRequired);
  const getPollingInterval = useEffectEvent(() => pollingInterval);
  const getInitialBaseline = useEffectEvent(() => initialBaseline);

  useEffect(() => {
    if (!storeId) return;
    const baseline = getInitialBaseline();
    let cursor = baseline.nextCursor;
    let initialized = true;
    let stopped = false;
    let running = false;
    let consecutiveFailures = 0;
    let timeout: number | undefined;
    const processedEventIds = new Map(
      baseline.processedEventIds.map((eventId) => [eventId, Date.now()]),
    );

    const poll = async () => {
      if (stopped || running || document.visibilityState === 'hidden') return;
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
        timeout = undefined;
      }
      running = true;
      const pendingSignals: Array<{
        eventId: string;
        orderId: string;
        orderNumber: number;
        isNew: boolean;
      }> = [];
      try {
        let hasMore = false;
        let pages = 0;
        do {
          const data = actionData(await getOrderNotificationSignalsAction({
            cursor,
            seenEventIds: [...processedEventIds.keys()],
          }));
          if (stopped) return;
          cursor = data.nextCursor;
          const observedAt = Date.now();
          for (const eventId of data.processedEventIds) processedEventIds.set(eventId, observedAt);
          for (const [eventId, firstObservedAt] of processedEventIds) {
            if (firstObservedAt < observedAt - 6 * 60 * 1_000) processedEventIds.delete(eventId);
          }
          if (processedEventIds.size >= 5_000) {
            while (processedEventIds.size > 5_000) {
              const oldest = processedEventIds.keys().next().value;
              if (!oldest) break;
              processedEventIds.delete(oldest);
            }
            reconcile();
          }
          if (initialized && data.items.length) pendingSignals.push(...data.items);
          initialized = true;
          hasMore = data.hasMore;
          pages += 1;
        } while (hasMore && pages < 10 && !stopped);
        if (hasMore && !stopped) {
          timeout = window.setTimeout(poll, 0);
          return;
        }
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          consecutiveFailures = 0;
          reconcile();
        }
      } finally {
        running = false;
        if (!stopped && pendingSignals.length) emitSignals(pendingSignals);
        if (!stopped && timeout === undefined) {
          timeout = window.setTimeout(poll, getPollingInterval());
        }
      }
    };

    const pollWhenVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    void poll();
    window.addEventListener('focus', pollWhenVisible);
    document.addEventListener('visibilitychange', pollWhenVisible);
    return () => {
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener('focus', pollWhenVisible);
      document.removeEventListener('visibilitychange', pollWhenVisible);
    };
  }, [authorizationScope, storeId]);

}

export function useOrderDetails(
  storeId: string | null,
  authorizationScope: string,
  orderId: string | null,
) {
  return useQuery({
    queryKey: orderQueryKeys.details(storeId, authorizationScope, orderId),
    queryFn: async ({ signal }) => {
      if (!orderId) throw new Error('Pedido não selecionado.');
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return actionData(await getOrderDetailsAction({ orderId }));
    },
    enabled: Boolean(storeId && orderId),
    staleTime: 10_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useOrderHistory(
  storeId: string | null,
  authorizationScope: string,
  orderId: string | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: orderQueryKeys.history(storeId, authorizationScope, orderId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (!orderId) throw new Error('Pedido não selecionado.');
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return actionData(
        await getOrderHistoryAction({
          orderId,
          cursor: pageParam ?? undefined,
          pageSize: 20,
        }),
      );
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(enabled && storeId && orderId),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useOrderMetrics(
  storeId: string | null,
  authorizationScope: string,
  localDate: string,
  pollingInterval = 20_000,
) {
  return useQuery({
    queryKey: orderQueryKeys.metrics(storeId, authorizationScope, localDate),
    queryFn: async ({ signal }) => {
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return actionData(await getDailyOrderMetricsAction({ localDate }));
    },
    enabled: Boolean(storeId && localDate),
    staleTime: 30_000,
    retry: 2,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: pollingInterval,
    refetchIntervalInBackground: false,
  });
}
