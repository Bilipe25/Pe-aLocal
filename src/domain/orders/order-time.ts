const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function normalizeMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.floor(minutes));
}

function pluralize(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

/** Formats operational durations without exposing unwieldy minute totals. */
export function formatOperationalDuration(minutes: number | null) {
  if (minutes === null) return '—';

  const normalized = normalizeMinutes(minutes);
  if (normalized < 1) return 'menos de 1 min';
  if (normalized < MINUTES_PER_HOUR) return `${normalized} min`;

  if (normalized < MINUTES_PER_DAY) {
    const hours = Math.floor(normalized / MINUTES_PER_HOUR);
    const remainingMinutes = normalized % MINUTES_PER_HOUR;
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }

  const days = Math.floor(normalized / MINUTES_PER_DAY);
  const remainingHours = Math.floor((normalized % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const dayLabel = pluralize(days, 'dia', 'dias');
  return remainingHours > 0
    ? `${dayLabel} e ${pluralize(remainingHours, 'hora', 'horas')}`
    : dayLabel;
}

export function formatElapsedMinutes(minutes: number) {
  const normalized = normalizeMinutes(minutes);
  return normalized < 1 ? 'agora' : `há ${formatOperationalDuration(normalized)}`;
}

export function formatSlaAlertLabel(
  subject: string,
  elapsedMinutes: number,
  thresholdMinutes: number,
) {
  const elapsed = normalizeMinutes(elapsedMinutes);
  const threshold = Math.max(1, normalizeMinutes(thresholdMinutes));
  const delay = Math.max(0, elapsed - threshold);

  return delay < 1
    ? `${subject} atingiu o limite de ${formatOperationalDuration(threshold)}`
    : `${subject} em atraso ${formatElapsedMinutes(delay)}`;
}

export interface PromisedFulfillmentLabel {
  label: string;
  isOverdue: boolean;
}

export function formatPromisedFulfillment(
  minAtValue: string | null | undefined,
  maxAtValue: string | null | undefined,
  timeZone: string | undefined,
  nowMs: number,
  showOverdue = true,
): PromisedFulfillmentLabel | null {
  if (!minAtValue || !maxAtValue) return null;

  const minAt = new Date(minAtValue);
  const maxAt = new Date(maxAtValue);
  if (Number.isNaN(minAt.getTime()) || Number.isNaN(maxAt.getTime())) return null;

  if (showOverdue && nowMs > maxAt.getTime()) {
    const overdueMinutes = Math.floor((nowMs - maxAt.getTime()) / 60_000);
    return {
      label: `Previsão vencida ${formatElapsedMinutes(overdueMinutes)}`,
      isOverdue: true,
    };
  }

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  return {
    label: `Previsão ${formatter.format(minAt)}–${formatter.format(maxAt)}`,
    isOverdue: false,
  };
}
