import type { KdsLaneKey, KdsOrderStatus, KdsUrgency } from '@/types/kds';
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
