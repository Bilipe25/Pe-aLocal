import type { QueryClient } from '@tanstack/react-query';

import { diningRoomQueryKeys } from '@/lib/query/keys/dining-room';
import { kdsQueryKeys } from '@/lib/query/keys/kds';
import { orderQueryKeys } from '@/lib/query/keys/orders';

type OperationalInvalidation = {
  storeId: string;
  orderId?: string | null;
};

export async function invalidateOperationalOrderData(
  queryClient: QueryClient,
  { storeId, orderId }: OperationalInvalidation,
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardStore(storeId) }),
    queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardTemporalStore(storeId) }),
    queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) }),
    queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) }),
    queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) }),
    queryClient.invalidateQueries({ queryKey: diningRoomQueryKeys.store(storeId) }),
  ];

  if (orderId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.detailsStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.historyStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.internalNotesStore(storeId) }),
    );
  }

  await Promise.all(invalidations);
}

export async function invalidateDiningRoomData(queryClient: QueryClient, storeId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: diningRoomQueryKeys.store(storeId) }),
    queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardStore(storeId) }),
    queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) }),
  ]);
}
