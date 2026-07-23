import { describe, expect, it } from 'vitest';

import { orderQueueFiltersSchema } from '@/features/orders/query-schemas';

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
