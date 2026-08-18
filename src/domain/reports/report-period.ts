import { getStoreDayRangeUtc, getStoreLocalDate } from '@/lib/time/store-time';
import type { ReportSeriesGranularity, ReportsPeriodInput } from '@/types/reports';

const DAY_IN_MS = 86_400_000;

function localDateToUtc(localDate: string): Date {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addLocalDays(localDate: string, amount: number): string {
  const date = localDateToUtc(localDate);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function inclusiveLocalDays(startLocalDate: string, endLocalDate: string): number {
  return (
    Math.floor(
      (localDateToUtc(endLocalDate).getTime() - localDateToUtc(startLocalDate).getTime()) /
        DAY_IN_MS,
    ) + 1
  );
}

function formatLocalDate(localDate: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' })
    .format(localDateToUtc(localDate))
    .replace('.', '');
}

function formatPeriodLabel(startLocalDate: string, endLocalDate: string): string {
  if (startLocalDate === endLocalDate) {
    return formatLocalDate(startLocalDate, { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const start = formatLocalDate(startLocalDate, { day: '2-digit', month: 'short' });
  const end = formatLocalDate(endLocalDate, { day: '2-digit', month: 'short', year: 'numeric' });
  return `${start}–${end}`;
}

export interface ResolvedReportPeriod {
  preset: ReportsPeriodInput['preset'];
  label: string;
  comparisonLabel: string;
  startLocalDate: string;
  endLocalDate: string;
  durationDays: number;
  granularity: ReportSeriesGranularity;
  current: { start: Date; end: Date };
  previous: { start: Date; end: Date };
}

export function resolveReportPeriod(
  input: ReportsPeriodInput,
  timeZone: string,
  now: Date = new Date(),
): ResolvedReportPeriod {
  const today = getStoreLocalDate(now, timeZone);
  let startLocalDate: string;
  let endLocalDate: string;

  if (input.preset === 'CUSTOM') {
    startLocalDate = input.startLocalDate;
    endLocalDate = input.endLocalDate;
  } else {
    const days = input.preset === 'TODAY' ? 1 : input.preset === 'LAST_7_DAYS' ? 7 : 30;
    startLocalDate = addLocalDays(today, -(days - 1));
    endLocalDate = today;
  }

  const durationDays = inclusiveLocalDays(startLocalDate, endLocalDate);
  if (durationDays < 1 || durationDays > 365) {
    throw new RangeError('O período de relatórios deve ter entre 1 e 365 dias.');
  }

  const currentStart = getStoreDayRangeUtc(startLocalDate, timeZone).start;
  const requestedEnd = getStoreDayRangeUtc(endLocalDate, timeZone).end;
  const currentEnd = input.preset !== 'CUSTOM' && requestedEnd > now ? now : requestedEnd;
  const previousEnd = currentStart;
  const previousStartLocalDate = addLocalDays(startLocalDate, -durationDays);
  let previousStart = getStoreDayRangeUtc(previousStartLocalDate, timeZone).start;

  if (input.preset === 'TODAY') {
    const elapsed = Math.max(0, currentEnd.getTime() - currentStart.getTime());
    const previousDayEnd = getStoreDayRangeUtc(addLocalDays(startLocalDate, -1), timeZone).end;
    const matchedEnd = new Date(previousStart.getTime() + elapsed);
    return {
      preset: input.preset,
      label: `Hoje, até ${new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(now)}`,
      comparisonLabel: 'Mesmo horário de ontem',
      startLocalDate,
      endLocalDate,
      durationDays,
      granularity: 'HOUR',
      current: { start: currentStart, end: currentEnd },
      previous: {
        start: previousStart,
        end: matchedEnd < previousDayEnd ? matchedEnd : previousDayEnd,
      },
    };
  }

  if (input.preset === 'CUSTOM') {
    previousStart = getStoreDayRangeUtc(previousStartLocalDate, timeZone).start;
  } else {
    const elapsed = Math.max(0, currentEnd.getTime() - currentStart.getTime());
    previousStart = new Date(previousEnd.getTime() - elapsed);
  }

  return {
    preset: input.preset,
    label: formatPeriodLabel(startLocalDate, endLocalDate),
    comparisonLabel:
      input.preset === 'CUSTOM'
        ? formatPeriodLabel(previousStartLocalDate, addLocalDays(startLocalDate, -1))
        : 'Mesmo intervalo imediatamente anterior',
    startLocalDate,
    endLocalDate,
    durationDays,
    granularity: durationDays === 1 ? 'HOUR' : durationDays <= 14 ? 'DAY' : 'WEEK',
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}
