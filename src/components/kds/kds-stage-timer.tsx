import {
  formatKdsElapsed,
  formatKdsElapsedAccessible,
  getKdsElapsedSeconds,
  getKdsStageAccessibleLabel,
  getKdsUrgency,
} from '@/domain/orders/kds';
import type { KdsOrderDTO } from '@/types/kds';

export function KdsStageTimer({ order, nowMs }: { order: KdsOrderDTO; nowMs: number }) {
  const elapsedSeconds = getKdsElapsedSeconds(order.stageStartedAt, nowMs);
  const urgency = getKdsUrgency(elapsedSeconds, order.stageAlertThresholdMinutes);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const accessibleLabel = `${getKdsStageAccessibleLabel(order.status)} ${formatKdsElapsedAccessible(elapsedSeconds)}`;

  return (
    <time
      className="kds-ticket-timer"
      dateTime={`PT${minutes}M${seconds}S`}
      aria-label={accessibleLabel}
      data-urgency={urgency.toLowerCase()}
    >
      {formatKdsElapsed(elapsedSeconds)}
    </time>
  );
}
