import { describe, expect, it } from 'vitest';

import {
  deriveCustomerRelationshipSegment,
  getCustomerRelationshipThresholds,
} from '@/domain/customers/relationship';

const DAY_MS = 24 * 60 * 60 * 1_000;
const now = new Date('2026-09-02T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);

describe('customer relationship segmentation', () => {
  it.each([
    [1, 0, null, 'NEW'],
    [2, 2, 12, 'RETURNING'],
    [4, 5, 20, 'RECURRING'],
    [8, 5, 10, 'FREQUENT'],
    [6, 18, 10, 'COOLING'],
    [6, 25, 10, 'INACTIVE'],
  ] as const)(
    '%i pedidos, último há %i dias e intervalo %s → %s',
    (completedOrderCount, lastOrderDaysAgo, averageDaysBetweenOrders, expected) => {
      expect(
        deriveCustomerRelationshipSegment({
          completedOrderCount,
          lastCompletedOrderAt: daysAgo(lastOrderDaysAgo),
          averageDaysBetweenOrders,
          now,
        }),
      ).toBe(expected);
    },
  );

  it('marca como recuperado temporariamente depois de um retorno', () => {
    expect(
      deriveCustomerRelationshipSegment({
        completedOrderCount: 7,
        lastCompletedOrderAt: daysAgo(1),
        averageDaysBetweenOrders: 10,
        recoveredAt: daysAgo(1),
        now,
      }),
    ).toBe('RECOVERED');
  });

  it('retoma a classificação normal após a janela de recuperação', () => {
    expect(
      deriveCustomerRelationshipSegment({
        completedOrderCount: 7,
        lastCompletedOrderAt: daysAgo(31),
        averageDaysBetweenOrders: 10,
        recoveredAt: daysAgo(31),
        now,
      }),
    ).toBe('INACTIVE');
  });

  it('usa fallback de 30 dias quando o histórico ainda é insuficiente', () => {
    expect(
      getCustomerRelationshipThresholds({
        completedOrderCount: 2,
        averageDaysBetweenOrders: 8,
      }),
    ).toEqual({ mode: 'FALLBACK', coolingAfterDays: 21, inactiveAfterDays: 30 });
  });

  it('é determinístico para a mesma entrada', () => {
    const input = {
      completedOrderCount: 6,
      lastCompletedOrderAt: daysAgo(18),
      averageDaysBetweenOrders: 10,
      now,
    };
    expect(deriveCustomerRelationshipSegment(input)).toBe(deriveCustomerRelationshipSegment(input));
  });
});
