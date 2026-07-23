import { describe, expect, it } from 'vitest';

import {
  formatOrderDateForStore,
  getNextStoreMidnight,
  getStoreDayRangeUtc,
  getStoreLocalDate,
} from './store-time';

describe('store time', () => {
  it('determina a data da loja sem usar o fuso do processo ou da origem da data', () => {
    const instantFromJapan = new Date('2024-01-01T00:30:00+09:00');

    expect(getStoreLocalDate(instantFromJapan, 'America/Fortaleza')).toBe('2023-12-31');
    expect(getStoreLocalDate(new Date('2024-01-01T02:59:59Z'), 'America/Fortaleza')).toBe(
      '2023-12-31',
    );
    expect(getStoreLocalDate(new Date('2024-01-01T03:00:00Z'), 'America/Fortaleza')).toBe(
      '2024-01-01',
    );
  });

  it('retorna um dia estável de 24 horas em America/Fortaleza', () => {
    const range = getStoreDayRangeUtc('2024-06-15', 'America/Fortaleza');

    expect(range.start.toISOString()).toBe('2024-06-15T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2024-06-16T03:00:00.000Z');
  });

  it('trata o início histórico do DST em America/Sao_Paulo', () => {
    const range = getStoreDayRangeUtc('2018-11-04', 'America/Sao_Paulo');

    expect(range.start.toISOString()).toBe('2018-11-04T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2018-11-05T02:00:00.000Z');
    expect(range.end.getTime() - range.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('trata o fim histórico do DST em America/Sao_Paulo', () => {
    const range = getStoreDayRangeUtc('2019-02-16', 'America/Sao_Paulo');

    expect(range.start.toISOString()).toBe('2019-02-16T02:00:00.000Z');
    expect(range.end.toISOString()).toBe('2019-02-17T03:00:00.000Z');
    expect(range.end.getTime() - range.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('trata o início e o fim do DST em America/New_York', () => {
    const spring = getStoreDayRangeUtc('2024-03-10', 'America/New_York');
    const fall = getStoreDayRangeUtc('2024-11-03', 'America/New_York');

    expect(spring.start.toISOString()).toBe('2024-03-10T05:00:00.000Z');
    expect(spring.end.toISOString()).toBe('2024-03-11T04:00:00.000Z');
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(fall.start.toISOString()).toBe('2024-11-03T04:00:00.000Z');
    expect(fall.end.toISOString()).toBe('2024-11-04T05:00:00.000Z');
    expect(fall.end.getTime() - fall.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('calcula a próxima meia-noite local através de uma virada com DST', () => {
    expect(
      getNextStoreMidnight(new Date('2024-03-10T06:30:00.000Z'), 'America/New_York').toISOString(),
    ).toBe('2024-03-11T04:00:00.000Z');
    expect(
      getNextStoreMidnight(new Date('2024-11-03T05:30:00.000Z'), 'America/New_York').toISOString(),
    ).toBe('2024-11-04T05:00:00.000Z');
  });

  it('formata a data do pedido no fuso explícito da loja', () => {
    const formatted = formatOrderDateForStore(
      new Date('2024-01-01T02:30:00.000Z'),
      'America/Fortaleza',
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      },
    );

    expect(formatted).toBe('31/12/2023, 23:30');
  });

  it('rejeita datas locais e fusos inválidos', () => {
    expect(() => getStoreDayRangeUtc('2024-02-30', 'America/Fortaleza')).toThrow(RangeError);
    expect(() => getStoreDayRangeUtc('15/06/2024', 'America/Fortaleza')).toThrow(RangeError);
    expect(() => getStoreDayRangeUtc('2024-06-15', 'America/Invalid')).toThrow(RangeError);
  });
});
