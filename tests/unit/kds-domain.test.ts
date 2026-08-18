import { describe, expect, it } from 'vitest';

import {
  formatKdsElapsed,
  formatKdsElapsedAccessible,
  getKdsElapsedSeconds,
  getKdsLaneForStatus,
  getKdsUrgency,
  isKdsOrderStatus,
} from '@/domain/orders/kds';

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
});
