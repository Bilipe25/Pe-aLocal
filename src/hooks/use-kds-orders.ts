'use client';

import { useQuery } from '@tanstack/react-query';

import { getKdsSnapshotAction } from '@/features/kds/actions';
import type { OrderRealtimeState } from '@/hooks/use-order-realtime';
import { kdsQueryKeys } from '@/lib/query/keys/kds';
import type { KdsSnapshotDTO } from '@/types/kds';

export { kdsQueryKeys } from '@/lib/query/keys/kds';

export function kdsPollingInterval(state: OrderRealtimeState) {
  return state === 'connected' ? 25_000 : 15_000;
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
