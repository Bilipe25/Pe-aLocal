'use client';

import { useQuery } from '@tanstack/react-query';

import {
  getDiningRoomSnapshotAction,
  getDiningSessionDetailAction,
} from '@/features/dining-room/actions';
import type { OrderRealtimeState } from '@/hooks/use-order-realtime';
import type { DiningRoomSnapshotDto, DiningSessionDetailDto } from '@/types/dining-room';

export const diningRoomQueryKeys = {
  snapshot: (storeId: string, authorizationScope: string) =>
    ['dining-room', storeId, authorizationScope] as const,
  store: (storeId: string) => ['dining-room', storeId] as const,
  detail: (storeId: string, authorizationScope: string, sessionId: string | null) =>
    ['dining-room-detail', storeId, authorizationScope, sessionId] as const,
};

function actionData<T>(
  result: { success: true; data: T } | { success: false; error: { message: string } },
): T {
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

export function useDiningRoom(
  storeId: string,
  authorizationScope: string,
  initialData: DiningRoomSnapshotDto,
  realtimeState: OrderRealtimeState,
) {
  return useQuery({
    queryKey: diningRoomQueryKeys.snapshot(storeId, authorizationScope),
    queryFn: async ({ signal }) => {
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      const data = actionData(await getDiningRoomSnapshotAction());
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return data;
    },
    initialData,
    staleTime: 5_000,
    retry: 2,
    refetchInterval: realtimeState === 'connected' ? 60_000 : 25_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
}

export function useDiningSessionDetail(
  storeId: string,
  authorizationScope: string,
  sessionId: string | null,
) {
  return useQuery<DiningSessionDetailDto>({
    queryKey: diningRoomQueryKeys.detail(storeId, authorizationScope, sessionId),
    queryFn: async ({ signal }) => {
      if (!sessionId) throw new Error('Atendimento não selecionado.');
      const data = actionData(await getDiningSessionDetailAction(sessionId));
      if (signal.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      return data;
    },
    enabled: Boolean(sessionId),
    staleTime: 3_000,
    retry: 1,
  });
}
