'use client';

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import {
  getDailyOrderMetricsAction,
  getOrderDetailsAction,
  getOrderHistoryAction,
  getOrderQueueAction,
} from '@/features/orders/query-actions';
import { usePusherChannel } from '@/hooks/use-pusher-channel';
import type { OrderQueueFilters } from '@/types/order-query';

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
};

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
  const queryClient = useQueryClient();
  const queryKey = orderQueryKeys.queue(storeId, authorizationScope, filters, searchToken);
  const query = useInfiniteQuery({
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

  const channelName = storeId ? `store-${storeId}` : null;
  const refreshStore = (orderId?: string) => {
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) });
    void queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) });
    if (orderId) {
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.details(storeId, authorizationScope, orderId) });
      void queryClient.invalidateQueries({ queryKey: orderQueryKeys.history(storeId, authorizationScope, orderId) });
    }
  };

  usePusherChannel<{ orderId: string; orderNumber: number }>(channelName, 'new-order', (event) => {
    refreshStore(event.orderId);
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {});
    } catch {
      // Som continua opcional até as preferências da Fase 5.
    }
  });
  usePusherChannel<{ orderId: string }>(channelName, 'order-updated', (event) => {
    refreshStore(event.orderId);
  });
  usePusherChannel<{ orderId: string }>(channelName, 'payment-updated', (event) => {
    refreshStore(event.orderId);
  });

  return query;
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
  });
}
