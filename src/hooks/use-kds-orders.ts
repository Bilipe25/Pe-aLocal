'use client';

import { useQuery } from '@tanstack/react-query';

import { getKdsSnapshotAction } from '@/features/kds/actions';
import type { OrderRealtimeState } from '@/hooks/use-order-realtime';
import type { KdsSnapshotDTO } from '@/types/kds';

export const kdsQueryKeys = {
  snapshot: (storeId: string, authorizationScope: string) =>
    ['kds-orders', storeId, authorizationScope] as const,
  store: (storeId: string) => ['kds-orders', storeId] as const,
};

export function kdsPollingInterval(state: OrderRealtimeState) {
  return state === 'connected' ? 60_000 : 20_000;
}

function actionData(result: Awaited<ReturnType<typeof getKdsSnapshotAction>>): KdsSnapshotDTO {
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

export function useKdsOrders(
  storeId: string,
  authorizationScope: string,
  initialData: KdsSnapshotDTO,
  realtimeState: OrderRealtimeState,
) {
  return useQuery({
    queryKey: kdsQueryKeys.snapshot(storeId, authorizationScope),
    queryFn: async ({ signal }) => {
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      const result = actionData(await getKdsSnapshotAction());
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return result;
    },
    initialData,
    staleTime: 5_000,
    retry: 2,
    refetchInterval: kdsPollingInterval(realtimeState),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
