import { getOrderStageAlertThresholdMinutes } from '@/domain/orders/order-operations';
import type { KdsLaneKey, KdsOrderStatus, KdsUrgency } from '@/types/kds';
import type { KdsSnapshotDTO } from '@/types/kds';
import { KDS_ORDER_STATUSES } from '@/types/kds';

export const KDS_LANES: readonly KdsLaneKey[] = ['TODO', 'MAKING', 'READY'];

export function isKdsOrderStatus(status: string): status is KdsOrderStatus {
  return (KDS_ORDER_STATUSES as readonly string[]).includes(status);
}

export function getKdsLaneForStatus(status: KdsOrderStatus): KdsLaneKey {
  switch (status) {
    case 'CONFIRMED':
      return 'TODO';
    case 'PREPARING':
      return 'MAKING';
    case 'READY':
      return 'READY';
  }
}

export function getKdsElapsedSeconds(startedAt: string | Date, nowMs = Date.now()): number {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
}

export function getKdsUrgency(elapsedSeconds: number, thresholdMinutes: number): KdsUrgency {
  const thresholdSeconds = Math.max(1, Math.floor(thresholdMinutes)) * 60;
  if (elapsedSeconds >= thresholdSeconds * 2) return 'CRITICAL';
  if (elapsedSeconds >= thresholdSeconds) return 'WARNING';
  return 'NORMAL';
}

export function formatKdsElapsed(elapsedSeconds: number): string {
  const normalized = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (normalized % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatKdsElapsedAccessible(elapsedSeconds: number): string {
  const normalized = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} e ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
}

export function getKdsStageAccessibleLabel(status: KdsOrderStatus): string {
  switch (status) {
    case 'CONFIRMED':
      return 'Aguardando início há';
    case 'PREPARING':
      return 'Em preparo há';
    case 'READY':
      return 'Pronto há';
  }
}

export function getKdsUrgencyLabel(status: KdsOrderStatus, urgency: KdsUrgency): string | null {
  if (urgency === 'NORMAL') return null;
  if (urgency === 'WARNING') return status === 'READY' ? 'Aguardando saída' : 'Atenção';
  switch (status) {
    case 'CONFIRMED':
      return 'Prioridade alta';
    case 'PREPARING':
      return 'Passou do tempo';
    case 'READY':
      return 'Aguardando saída';
  }
}

export function applyConfirmedKdsTransition(
  snapshot: KdsSnapshotDTO,
  input: {
    orderId: string;
    status: string;
    version: number;
    statusChangedAt: string;
  },
): KdsSnapshotDTO {
  const lanes = {
    TODO: { ...snapshot.lanes.TODO, items: [...snapshot.lanes.TODO.items] },
    MAKING: { ...snapshot.lanes.MAKING, items: [...snapshot.lanes.MAKING.items] },
    READY: { ...snapshot.lanes.READY, items: [...snapshot.lanes.READY.items] },
  };
  let currentOrder = null as (typeof lanes.TODO.items)[number] | null;
  let currentLane = null as KdsLaneKey | null;

  for (const lane of KDS_LANES) {
    const index = lanes[lane].items.findIndex((order) => order.id === input.orderId);
    if (index < 0) continue;
    currentOrder = lanes[lane].items[index];
    currentLane = lane;
    lanes[lane].items.splice(index, 1);
    lanes[lane].total = Math.max(0, lanes[lane].total - 1);
    break;
  }

  if (!currentOrder || !currentLane) return snapshot;
  if (!isKdsOrderStatus(input.status)) {
    return {
      ...snapshot,
      lanes,
      total: Math.max(0, snapshot.total - 1),
      updatedAt: input.statusChangedAt,
    };
  }

  const targetLane = getKdsLaneForStatus(input.status);
  const threshold = getOrderStageAlertThresholdMinutes({
    status: input.status,
    modality: currentOrder.modality,
    estimatedTimeMaxMinutes: snapshot.estimatedTimeMaxMinutes,
  });
  lanes[targetLane].items.push({
    ...currentOrder,
    status: input.status,
    version: input.version,
    stageStartedAt: input.statusChangedAt,
    stageAlertThresholdMinutes: threshold ?? currentOrder.stageAlertThresholdMinutes,
  });
  lanes[targetLane].items.sort(
    (left, right) =>
      new Date(left.stageStartedAt).getTime() - new Date(right.stageStartedAt).getTime() ||
      left.id.localeCompare(right.id),
  );
  lanes[targetLane].total += 1;

  return { ...snapshot, lanes, updatedAt: input.statusChangedAt };
}
