const DAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type OfferDayOfWeek = (typeof DAY_NAMES)[number];

export interface OfferSchedule {
  startsOn?: Date | string | null;
  endsOnExclusive?: Date | string | null;
  weekdays?: readonly OfferDayOfWeek[] | null;
  startMinute?: number | null;
  endMinuteExclusive?: number | null;
}

interface LocalClock {
  localDate: string;
  minute: number;
}

function dateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new RangeError('A data da oferta é inválida.');
    return value.toISOString().slice(0, 10);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/.exec(value)?.[1];
  if (!date) {
    throw new RangeError('A data da oferta deve estar no formato YYYY-MM-DD.');
  }
  return date;
}

function dayOfWeek(localDate: string): OfferDayOfWeek {
  return DAY_NAMES[new Date(`${localDate}T00:00:00.000Z`).getUTCDay()]!;
}

function addDays(localDate: string, amount: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function compareDates(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scheduleHasOvernightWindow(schedule: OfferSchedule): boolean {
  return (
    schedule.startMinute != null &&
    schedule.endMinuteExclusive != null &&
    schedule.endMinuteExclusive < schedule.startMinute
  );
}

function assertTimeWindow(schedule: OfferSchedule): void {
  const { startMinute, endMinuteExclusive } = schedule;
  if (startMinute == null && endMinuteExclusive == null) return;
  if (
    startMinute == null ||
    endMinuteExclusive == null ||
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinuteExclusive) ||
    startMinute < 0 ||
    startMinute > 1439 ||
    endMinuteExclusive < 0 ||
    endMinuteExclusive > 1439 ||
    startMinute === endMinuteExclusive
  ) {
    throw new RangeError('A janela de horário da oferta é inválida.');
  }
}

function isBaseDateEligible(schedule: OfferSchedule, baseDate: string): boolean {
  const startsOn = dateOnly(schedule.startsOn);
  const endsOnExclusive = dateOnly(schedule.endsOnExclusive);
  if (startsOn && compareDates(baseDate, startsOn) < 0) return false;
  if (endsOnExclusive && compareDates(baseDate, endsOnExclusive) >= 0) return false;

  const weekdays = schedule.weekdays ?? [];
  return weekdays.length === 0 || weekdays.includes(dayOfWeek(baseDate));
}

export function isOfferScheduleActiveAtLocal(
  schedule: OfferSchedule,
  localDate: string,
  minute: number,
): boolean {
  assertTimeWindow(schedule);
  dateOnly(localDate);
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
    throw new RangeError('O horário local da oferta é inválido.');
  }

  const { startMinute, endMinuteExclusive } = schedule;
  if (startMinute == null || endMinuteExclusive == null) {
    return isBaseDateEligible(schedule, localDate);
  }

  if (endMinuteExclusive > startMinute) {
    return (
      isBaseDateEligible(schedule, localDate) &&
      minute >= startMinute &&
      minute < endMinuteExclusive
    );
  }

  if (minute >= startMinute) return isBaseDateEligible(schedule, localDate);
  if (minute < endMinuteExclusive) return isBaseDateEligible(schedule, addDays(localDate, -1));
  return false;
}

function getLocalClock(now: Date, timeZone: string): LocalClock {
  if (!Number.isFinite(now.getTime())) throw new RangeError('O instante da oferta é inválido.');

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new RangeError('O fuso horário da loja é inválido.');
  }

  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(hour + minute)) {
    throw new RangeError('Não foi possível determinar o horário local da loja.');
  }
  return { localDate, minute: hour * 60 + minute };
}

export function isOfferScheduleActive(
  schedule: OfferSchedule,
  timeZone: string,
  now = new Date(),
): boolean {
  const clock = getLocalClock(now, timeZone);
  return isOfferScheduleActiveAtLocal(schedule, clock.localDate, clock.minute);
}

export function offerSchedulesOverlap(left: OfferSchedule, right: OfferSchedule): boolean {
  assertTimeWindow(left);
  assertTimeWindow(right);

  const leftStart = dateOnly(left.startsOn);
  const rightStart = dateOnly(right.startsOn);
  const leftEnd = dateOnly(left.endsOnExclusive);
  const rightEnd = dateOnly(right.endsOnExclusive);
  const occurrenceStart = [leftStart, rightStart]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const occurrenceEnds = [
    leftEnd ? addDays(leftEnd, scheduleHasOvernightWindow(left) ? 1 : 0) : null,
    rightEnd ? addDays(rightEnd, scheduleHasOvernightWindow(right) ? 1 : 0) : null,
  ].filter((value): value is string => Boolean(value));
  const occurrenceEnd = occurrenceEnds.sort().at(0);

  if (occurrenceStart && occurrenceEnd && compareDates(occurrenceStart, occurrenceEnd) >= 0) {
    return false;
  }

  const scanStart = occurrenceStart ?? '2000-01-03';
  const scanDays = occurrenceEnd
    ? Math.min(
        15,
        Math.max(
          0,
          Math.ceil(
            (Date.parse(`${occurrenceEnd}T00:00:00Z`) - Date.parse(`${scanStart}T00:00:00Z`)) /
              86_400_000,
          ),
        ),
      )
    : 15;

  for (let dayOffset = 0; dayOffset < scanDays; dayOffset += 1) {
    const localDate = addDays(scanStart, dayOffset);
    for (let minute = 0; minute < 1440; minute += 1) {
      if (
        isOfferScheduleActiveAtLocal(left, localDate, minute) &&
        isOfferScheduleActiveAtLocal(right, localDate, minute)
      ) {
        return true;
      }
    }
  }
  return false;
}
