import { describe, expect, it } from 'vitest';

import { MAX_DELIVERY_MONEY_REAIS } from '@/domain/delivery/constants';
import { createDeliveryZoneSchema, deliveryZoneVersionSchema } from '@/schemas/delivery';

const validZone = {
  name: 'Centro',
  fee: '5.00',
  minOrderValue: '20.00',
  estimatedTime: '30-40 min',
  isActive: 'true',
  sortOrder: '1',
  postalRanges: [
    {
      postalCodeStart: '01000-000',
      postalCodeEnd: '01099-999',
    },
  ],
};

describe('delivery zone schema', () => {
  it('normaliza CEP e valores sem transformar a string false em true', () => {
    const result = createDeliveryZoneSchema.parse({
      ...validZone,
      isActive: 'false',
    });

    expect(result.isActive).toBe(false);
    expect(result.postalRanges).toEqual([
      {
        postalCodeStart: '01000000',
        postalCodeEnd: '01099999',
      },
    ]);
  });

  it('normaliza prazo vazio para null e preserva o fallback da loja', () => {
    const result = createDeliveryZoneSchema.parse({
      ...validZone,
      estimatedTime: '   ',
    });

    expect(result.estimatedTime).toBeNull();
  });

  it.each([
    ['fee', String(MAX_DELIVERY_MONEY_REAIS + 0.01)],
    ['minOrderValue', String(MAX_DELIVERY_MONEY_REAIS + 0.01)],
  ])('rejeita %s acima do limite seguro do PostgreSQL', (field, value) => {
    const result = createDeliveryZoneSchema.safeParse({
      ...validZone,
      [field]: value,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true);
    }
  });

  it('aceita somente versões ISO com fuso para concorrência otimista', () => {
    expect(deliveryZoneVersionSchema.safeParse('2026-07-28T12:00:00.000Z').success).toBe(true);
    expect(deliveryZoneVersionSchema.safeParse('28/07/2026 12:00').success).toBe(false);
  });

  it('rejeita intervalo invertido', () => {
    const result = createDeliveryZoneSchema.safeParse({
      ...validZone,
      postalRanges: [
        {
          postalCodeStart: '01100-000',
          postalCodeEnd: '01000-000',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejeita faixas sobrepostas dentro da mesma zona', () => {
    const result = createDeliveryZoneSchema.safeParse({
      ...validZone,
      postalRanges: [
        {
          postalCodeStart: '01000-000',
          postalCodeEnd: '01050-000',
        },
        {
          postalCodeStart: '01049-999',
          postalCodeEnd: '01099-999',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'postalRanges')).toBe(true);
    }
  });

  it('considera o limite compartilhado como sobreposição dentro da mesma zona', () => {
    const result = createDeliveryZoneSchema.safeParse({
      ...validZone,
      postalRanges: [
        {
          postalCodeStart: '01000-000',
          postalCodeEnd: '01050-000',
        },
        {
          postalCodeStart: '01050-000',
          postalCodeEnd: '01099-999',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['postalRanges'],
          message: 'As faixas de CEP desta zona não podem se sobrepor.',
        }),
      );
    }
  });

  it.each(['30-40 min', '30–40 min', '45 min', '45 minutos'])(
    'aceita o prazo estimado seguro %s',
    (estimatedTime) => {
      expect(
        createDeliveryZoneSchema.safeParse({
          ...validZone,
          estimatedTime,
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    ['30-40', 'Informe o prazo em minutos'],
    ['agora', 'Informe o prazo em minutos'],
    ['0-40 min', 'Informe o prazo em minutos'],
    ['50-30 min', 'O prazo máximo precisa ser maior ou igual ao mínimo.'],
    ['1441 min', 'O prazo estimado deve ser de até 1440 minutos.'],
    ['999999999999999999999 min', 'Informe o prazo em minutos'],
  ])('rejeita o prazo inseguro %s', (estimatedTime, expectedMessage) => {
    const result = createDeliveryZoneSchema.safeParse({
      ...validZone,
      estimatedTime,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path[0] === 'estimatedTime' && issue.message.includes(expectedMessage),
        ),
      ).toBe(true);
    }
  });
});
