import type { OrderBoardFilters, OrderQueueFilters } from '@/types/order-query';

export function safeOrderBoardFilterKey(filters: OrderBoardFilters) {
  const safeFilters = { ...filters };
  delete safeFilters.query;
  return safeFilters;
}

export function safeOrderQueueFilterKey(filters: Omit<OrderQueueFilters, 'cursor'>) {
  const safeFilters = { ...filters };
  delete safeFilters.query;
  return safeFilters;
}

export const orderQueryKeys = {
  root: ['orders'] as const,
  store: (storeId: string | null) => ['orders', storeId] as const,
  boardStore: (storeId: string | null) => ['orders', storeId, 'board'] as const,
  board: (
    storeId: string | null,
    authorizationScope: string,
    filters: OrderBoardFilters,
    searchToken = 'none',
  ) =>
    [
      'orders',
      storeId,
      'board',
      authorizationScope,
      safeOrderBoardFilterKey(filters),
      searchToken,
    ] as const,
  boardTemporalStore: (storeId: string | null) =>
    ['orders', storeId, 'board-temporal-summary'] as const,
  boardTemporalSummary: (
    storeId: string | null,
    authorizationScope: string,
    filters: OrderBoardFilters,
    searchToken = 'none',
  ) =>
    [
      'orders',
      storeId,
      'board-temporal-summary',
      authorizationScope,
      safeOrderBoardFilterKey(filters),
      searchToken,
    ] as const,
  queueStore: (storeId: string | null) => ['orders', storeId, 'queue'] as const,
  queue: (
    storeId: string | null,
    authorizationScope: string,
    filters: Omit<OrderQueueFilters, 'cursor'>,
    searchToken = 'none',
  ) =>
    [
      'orders',
      storeId,
      'queue',
      authorizationScope,
      safeOrderQueueFilterKey(filters),
      searchToken,
    ] as const,
  detailsStore: (storeId: string | null) => ['orders', storeId, 'details'] as const,
  details: (storeId: string | null, authorizationScope: string, orderId: string | null) =>
    ['orders', storeId, 'details', authorizationScope, orderId] as const,
  historyStore: (storeId: string | null) => ['orders', storeId, 'history'] as const,
  history: (storeId: string | null, authorizationScope: string, orderId: string | null) =>
    ['orders', storeId, 'history', authorizationScope, orderId] as const,
  internalNotesStore: (storeId: string | null) => ['orders', storeId, 'internal-notes'] as const,
  internalNotes: (storeId: string | null, authorizationScope: string, orderId: string | null) =>
    ['orders', storeId, 'internal-notes', authorizationScope, orderId] as const,
  metricsStore: (storeId: string | null) => ['orders', storeId, 'metrics'] as const,
  metrics: (storeId: string | null, authorizationScope: string, localDate: string) =>
    ['orders', storeId, 'metrics', authorizationScope, localDate] as const,
  notifications: (storeId: string | null, authorizationScope: string) =>
    ['orders', storeId, 'notification-signals', authorizationScope] as const,
};
