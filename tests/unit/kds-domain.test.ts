import { describe, expect, it } from 'vitest';

import {
  applyConfirmedKdsTransition,
  formatKdsElapsed,
  formatKdsElapsedAccessible,
  getKdsElapsedSeconds,
  getKdsLaneForStatus,
  getKdsUrgency,
  isKdsOrderStatus,
} from '@/domain/orders/kds';
import type { KdsSnapshotDTO } from '@/types/kds';

const snapshot: KdsSnapshotDTO = {
  lanes: {
    TODO: {
      key: 'TODO',
      total: 1,
      items: [
        {
          id: 'order-a',
          orderNumber: 101,
          modality: 'PICKUP',
          diningTableLabel: null,
          status: 'CONFIRMED',
          version: 7,
          stageStartedAt: '2026-08-18T12:00:00.000Z',
          stageAlertThresholdMinutes: 5,
          notes: null,
          items: [],
        },
      ],
    },
    MAKING: { key: 'MAKING', total: 0, items: [] },
    READY: { key: 'READY', total: 0, items: [] },
  },
  total: 1,
  truncated: false,
  estimatedTimeMaxMinutes: 30,
  updatedAt: '2026-08-18T12:01:00.000Z',
};

describe('domínio operacional do KDS', () => {
  it('mapeia somente os três estados oficiais da cozinha', () => {
    expect(getKdsLaneForStatus('CONFIRMED')).toBe('TODO');
    expect(getKdsLaneForStatus('PREPARING')).toBe('MAKING');
    expect(getKdsLaneForStatus('READY')).toBe('READY');
    expect(isKdsOrderStatus('PENDING')).toBe(false);
    expect(isKdsOrderStatus('AWAITING_PAYMENT')).toBe(false);
    expect(isKdsOrderStatus('CANCELLED')).toBe(false);
  });

  it('deriva atenção e crítico do threshold oficial sem criar novo status', () => {
    expect(getKdsUrgency(4 * 60 + 59, 5)).toBe('NORMAL');
    expect(getKdsUrgency(5 * 60, 5)).toBe('WARNING');
    expect(getKdsUrgency(9 * 60 + 59, 5)).toBe('WARNING');
    expect(getKdsUrgency(10 * 60, 5)).toBe('CRITICAL');
  });

  it('mantém um relógio monotônico e legível', () => {
    const now = new Date('2026-08-18T12:01:01.000Z').getTime();
    const elapsed = getKdsElapsedSeconds('2026-08-18T12:00:00.000Z', now);
    expect(elapsed).toBe(61);
    expect(formatKdsElapsed(elapsed)).toBe('01:01');
    expect(formatKdsElapsedAccessible(elapsed)).toBe('1 minuto e 1 segundo');
  });

  it('move imediatamente o card usando a transição já confirmada pelo servidor', () => {
    const updated = applyConfirmedKdsTransition(snapshot, {
      orderId: 'order-a',
      status: 'PREPARING',
      version: 8,
      statusChangedAt: '2026-08-18T12:05:00.000Z',
    });

    expect(updated.lanes.TODO).toMatchObject({ total: 0, items: [] });
    expect(updated.lanes.MAKING.items[0]).toMatchObject({
      id: 'order-a',
      status: 'PREPARING',
      version: 8,
      stageStartedAt: '2026-08-18T12:05:00.000Z',
      stageAlertThresholdMinutes: 30,
    });
    expect(updated.lanes.MAKING.total).toBe(1);
    expect(updated.total).toBe(1);
  });

  it('remove imediatamente o card quando o estado confirmado sai do KDS', () => {
    const updated = applyConfirmedKdsTransition(snapshot, {
      orderId: 'order-a',
      status: 'CANCELLED',
      version: 8,
      statusChangedAt: '2026-08-18T12:05:00.000Z',
    });

    expect(updated.lanes.TODO).toMatchObject({ total: 0, items: [] });
    expect(updated.total).toBe(0);
  });
});
