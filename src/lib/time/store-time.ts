const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BOUNDARY_SEARCH_WINDOW_IN_MS = 3 * DAY_IN_MS;

export interface StoreDayRangeUtc {
  start: Date;
  end: Date;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

function assertValidDate(date: Date): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError('A data informada é inválida.');
  }
}

function createStoreDateFormatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 100) {
    throw new RangeError('O fuso horário informado é inválido.');
  }

  try {
    return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
    });
  } catch {
    throw new RangeError('O fuso horário informado é inválido.');
  }
}

function parseLocalDate(localDate: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new RangeError('A data local deve estar no formato YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (year === 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new RangeError('A data local informada é inválida.');
  }

  return { year, month, day };
}

function addLocalDay({ year, month, day }: LocalDateParts): LocalDateParts {
  const lastDay = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];

  if (day < lastDay) return { year, month, day: day + 1 };
  if (month < 12) return { year, month: month + 1, day: 1 };
  return { year: year + 1, month: 1, day: 1 };
}

function dateKey({ year, month, day }: LocalDateParts): number {
  return year * 372 + month * 31 + day;
}

function getFormattedDateParts(
  date: Date,
  formatter: Intl.DateTimeFormat,
): LocalDateParts {
  const parts = formatter.formatToParts(date);
  const yearPart = parts.find((part) => part.type === 'year')?.value;
  const monthPart = parts.find((part) => part.type === 'month')?.value;
  const dayPart = parts.find((part) => part.type === 'day')?.value;
  const era = parts.find((part) => part.type === 'era')?.value;

  if (!yearPart || !monthPart || !dayPart) {
    throw new RangeError('Não foi possível determinar a data no fuso da loja.');
  }

  const displayedYear = Number(yearPart);
  return {
    year: era === 'BC' ? 1 - displayedYear : displayedYear,
    month: Number(monthPart),
    day: Number(dayPart),
  };
}

function utcTimestamp({ year, month, day }: LocalDateParts): number {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function findStartOfLocalDate(
  localDate: LocalDateParts,
  formatter: Intl.DateTimeFormat,
): Date {
  const targetKey = dateKey(localDate);
  const nominalMidnight = utcTimestamp(localDate);
  let low = nominalMidnight - BOUNDARY_SEARCH_WINDOW_IN_MS;
  let high = nominalMidnight + BOUNDARY_SEARCH_WINDOW_IN_MS;

  if (
    dateKey(getFormattedDateParts(new Date(low), formatter)) >= targetKey ||
    dateKey(getFormattedDateParts(new Date(high), formatter)) < targetKey
  ) {
    throw new RangeError('Não foi possível determinar os limites da data local.');
  }

  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (dateKey(getFormattedDateParts(new Date(middle), formatter)) >= targetKey) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return new Date(high);
}

export function getStoreLocalDate(date: Date, timeZone: string): string {
  assertValidDate(date);
  const parts = getFormattedDateParts(date, createStoreDateFormatter(timeZone));
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function getStoreDayRangeUtc(
  localDate: string,
  timeZone: string,
): StoreDayRangeUtc {
  const parsedDate = parseLocalDate(localDate);
  const formatter = createStoreDateFormatter(timeZone);

  return {
    start: findStartOfLocalDate(parsedDate, formatter),
    end: findStartOfLocalDate(addLocalDay(parsedDate), formatter),
  };
}

export function formatOrderDateForStore(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  assertValidDate(date);
  createStoreDateFormatter(timeZone);
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone }).format(date);
}

export function getNextStoreMidnight(date: Date, timeZone: string): Date {
  assertValidDate(date);
  const localDate = parseLocalDate(getStoreLocalDate(date, timeZone));
  return findStartOfLocalDate(addLocalDay(localDate), createStoreDateFormatter(timeZone));
}
