import { describe, expect, it } from 'vitest';

import {
  orderBoardFiltersSchema,
  orderBoardLaneInputSchema,
  orderNotificationSignalsInputSchema,
  orderQueueFiltersSchema,
} from '@/features/orders/query-schemas';

describe('filtros serializáveis da fila', () => {
  it('aplica paginação padrão e remove busca vazia', () => {
    expect(orderQueueFiltersSchema.parse({ query: '  ' })).toEqual({
      pageSize: 30,
      query: undefined,
      statuses: undefined,
    });
  });

  it('aceita número imediatamente e exige dois caracteres para texto', () => {
    expect(orderQueueFiltersSchema.safeParse({ query: '#7' }).success).toBe(true);
    expect(orderQueueFiltersSchema.safeParse({ query: 'a' }).success).toBe(false);
    expect(orderQueueFiltersSchema.safeParse({ query: 'ana' }).success).toBe(true);
  });

  it('rejeita data inexistente e objetos Date', () => {
    expect(orderQueueFiltersSchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(orderQueueFiltersSchema.safeParse({ date: new Date() }).success).toBe(false);
  });

  it('não aceita status e statuses simultaneamente', () => {
    expect(
      orderQueueFiltersSchema.safeParse({
        status: 'PENDING',
        statuses: ['PENDING', 'PREPARING'],
      }).success,
    ).toBe(false);
  });

  it('rejeita AWAITING_PAYMENT após a adoção do Modelo A', () => {
    expect(orderQueueFiltersSchema.safeParse({ status: 'AWAITING_PAYMENT' }).success).toBe(false);
  });

  it('deduplica statuses e limita pageSize', () => {
    const parsed = orderQueueFiltersSchema.parse({
      statuses: ['PENDING', 'PENDING', 'PREPARING'],
      pageSize: 100,
    });
    expect(parsed.statuses).toEqual(['PENDING', 'PREPARING']);
    expect(orderQueueFiltersSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('filtros serializáveis do board', () => {
  it('exige a data local e aplica defaults seguros', () => {
    expect(orderBoardFiltersSchema.parse({ localDate: '2026-07-31' })).toEqual({
      localDate: '2026-07-31',
      onlyActive: false,
      delayedOnly: false,
    });
    expect(orderBoardFiltersSchema.safeParse({}).success).toBe(false);
  });

  it('mantém o input estrito, deduplica etapas e rejeita status legado', () => {
    expect(
      orderBoardFiltersSchema.parse({
        localDate: '2026-07-31',
        statuses: ['PENDING', 'PENDING', 'READY'],
      }).statuses,
    ).toEqual(['PENDING', 'READY']);
    expect(
      orderBoardFiltersSchema.safeParse({ localDate: '2026-07-31', unexpected: true }).success,
    ).toBe(false);
    expect(
      orderBoardFiltersSchema.safeParse({
        localDate: '2026-07-31',
        statuses: ['AWAITING_PAYMENT'],
      }).success,
    ).toBe(false);
  });

  it('valida paginação independente por coluna', () => {
    expect(
      orderBoardLaneInputSchema.parse({
        localDate: '2026-07-31',
        lane: 'PREPARATION',
      }),
    ).toEqual(
      expect.objectContaining({
        lane: 'PREPARATION',
        pageSize: 10,
        onlyActive: false,
        delayedOnly: false,
      }),
    );
    expect(
      orderBoardLaneInputSchema.safeParse({
        localDate: '2026-07-31',
        lane: 'UNKNOWN',
      }).success,
    ).toBe(false);
    expect(
      orderBoardLaneInputSchema.safeParse({
        localDate: '2026-07-31',
        lane: 'NEW',
        pageSize: 11,
      }).success,
    ).toBe(false);
  });
});

describe('sinais de atualização dos pedidos', () => {
  it('limita a janela de eventos processados e rejeita campos extras', () => {
    const ids = Array.from(
      { length: 251 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    );

    expect(orderNotificationSignalsInputSchema.safeParse({ seenEventIds: ids }).success).toBe(
      false,
    );
    expect(
      orderNotificationSignalsInputSchema.safeParse({ seenEventIds: [], unexpected: true }).success,
    ).toBe(false);
  });
});
