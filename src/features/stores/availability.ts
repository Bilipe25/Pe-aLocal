import { APPROVED_STORE_TIME_ZONES } from '@/schemas/store';

export type EffectiveStoreAvailabilityState =
  | 'OPEN'
  | 'CLOSED_BY_SCHEDULE'
  | 'MANUALLY_CLOSED'
  | 'PAUSED'
  | 'TENANT_SUSPENDED'
  | 'STORE_INACTIVE'
  | 'NOT_READY';

export interface EffectiveStoreAvailability {
  acceptingOrders: boolean;
  state: EffectiveStoreAvailabilityState;
  reason: string;
  nextTransitionAt: Date | null;
}

export interface StoreAvailabilityInput {
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  storeStatus: 'OPEN' | 'CLOSED' | 'PAUSED';
  isActive: boolean;
  isReady: boolean;
  timeZone: string;
  openingHours: {
    dayOfWeek: string;
    openTime: string;
    closeTime: string;
  }[];
  scheduleExceptions: {
    date: Date | string;
    type: 'CLOSED' | 'CUSTOM_HOURS';
    openTime: string | null;
    closeTime: string | null;
  }[];
}

const DAY_OF_WEEK = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;
const APPROVED_TIME_ZONES = new Set<string>(APPROVED_STORE_TIME_ZONES);

interface LocalDateTime {
  date: string;
  time: string;
}

function dateKey(value: Date | string) {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayOfWeek(date: string) {
  return DAY_OF_WEEK[new Date(`${date}T00:00:00.000Z`).getUTCDay()];
}

function localDateTime(instant: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function wallTimeAsUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(desiredWallTime);

  // Intl não expõe diretamente a conversão de horário de parede para UTC.
  // Duas correções convergem para os fusos IANA brasileiros aprovados.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = localDateTime(instant, timeZone);
    const [localYear, localMonth, localDay] = local.date.split('-').map(Number);
    const [localHour, localMinute] = local.time.split(':').map(Number);
    const actualWallTime = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute);
    const correction = desiredWallTime - actualWallTime;
    if (correction === 0) break;
    instant = new Date(instant.getTime() + correction);
  }

  return instant;
}

function formatTransition(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

function unavailable(
  state: Exclude<EffectiveStoreAvailabilityState, 'OPEN'>,
  reason: string,
  nextTransitionAt: Date | null = null,
): EffectiveStoreAvailability {
  return { acceptingOrders: false, state, reason, nextTransitionAt };
}

export function evaluateEffectiveStoreAvailability(
  input: StoreAvailabilityInput,
  now = new Date(),
): EffectiveStoreAvailability {
  if (input.tenantStatus !== 'ACTIVE') {
    return unavailable(
      'TENANT_SUSPENDED',
      'Este estabelecimento está temporariamente indisponível.',
    );
  }
  if (!input.isActive) {
    return unavailable('STORE_INACTIVE', 'Este estabelecimento está temporariamente indisponível.');
  }
  if (input.storeStatus === 'PAUSED') {
    return unavailable('PAUSED', 'Os pedidos estão pausados temporariamente.');
  }
  if (input.storeStatus === 'CLOSED') {
    return unavailable('MANUALLY_CLOSED', 'A loja está fechada manualmente.');
  }
  if (!input.isReady || !APPROVED_TIME_ZONES.has(input.timeZone)) {
    return unavailable('NOT_READY', 'A loja ainda não está pronta para receber pedidos.');
  }

  const localNow = localDateTime(now, input.timeZone);
  const exceptions = new Map(input.scheduleExceptions.map((item) => [dateKey(item.date), item]));
  const hours = new Map(input.openingHours.map((item) => [item.dayOfWeek, item]));

  function intervalForDate(date: string) {
    const exception = exceptions.get(date);
    if (exception?.type === 'CLOSED') return null;
    if (exception?.type === 'CUSTOM_HOURS') {
      if (!exception.openTime || !exception.closeTime) return null;
      return { openTime: exception.openTime, closeTime: exception.closeTime };
    }
    const regular = hours.get(dayOfWeek(date));
    return regular ? { openTime: regular.openTime, closeTime: regular.closeTime } : null;
  }

  function intervalInstants(date: string) {
    const interval = intervalForDate(date);
    if (!interval) return null;
    const crossesMidnight = interval.closeTime <= interval.openTime;
    return {
      startsAt: wallTimeAsUtc(date, interval.openTime, input.timeZone),
      endsAt: wallTimeAsUtc(
        crossesMidnight ? addDays(date, 1) : date,
        interval.closeTime,
        input.timeZone,
      ),
    };
  }

  // Uma exceção da data atual substitui o calendário inteiro desse dia,
  // inclusive o trecho noturno iniciado na véspera.
  const currentIntervals = exceptions.has(localNow.date)
    ? [localNow.date]
    : [addDays(localNow.date, -1), localNow.date];
  for (const date of currentIntervals) {
    const interval = intervalInstants(date);
    if (interval && now >= interval.startsAt && now < interval.endsAt) {
      return {
        acceptingOrders: true,
        state: 'OPEN',
        reason: `Aberta agora. Fecha ${formatTransition(interval.endsAt, input.timeZone)}.`,
        nextTransitionAt: interval.endsAt,
      };
    }
  }

  for (let offset = 0; offset <= 31; offset += 1) {
    const interval = intervalInstants(addDays(localNow.date, offset));
    if (interval && interval.startsAt > now) {
      return unavailable(
        'CLOSED_BY_SCHEDULE',
        `Fechada agora pelo horário. Abre ${formatTransition(interval.startsAt, input.timeZone)}.`,
        interval.startsAt,
      );
    }
  }

  return unavailable('CLOSED_BY_SCHEDULE', 'Fechada agora pelo horário de funcionamento.');
}
