export const diningRoomQueryKeys = {
  root: ['dining-room'] as const,
  store: (storeId: string) => ['dining-room', storeId] as const,
  snapshot: (storeId: string, authorizationScope: string) =>
    ['dining-room', storeId, 'snapshot', authorizationScope] as const,
  details: (storeId: string) => ['dining-room', storeId, 'detail'] as const,
  detail: (storeId: string, authorizationScope: string, sessionId: string | null) =>
    ['dining-room', storeId, 'detail', authorizationScope, sessionId] as const,
};
