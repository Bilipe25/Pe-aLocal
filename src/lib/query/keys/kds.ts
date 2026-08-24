export const kdsQueryKeys = {
  root: ['kds'] as const,
  store: (storeId: string) => ['kds', storeId] as const,
  snapshot: (storeId: string, authorizationScope: string) =>
    ['kds', storeId, 'snapshot', authorizationScope] as const,
};
