import { describe, expect, it } from 'vitest';

import { classifyCustomer } from '@/domain/customers/classification';

describe('classifyCustomer', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');

  it('does not classify customers without an eligible purchase', () => {
    expect(classifyCustomer({ completedOrders: 0, lastOrderAt: null, now })).toBeNull();
  });

  it('classifies exactly one completed and paid purchase as new', () => {
    expect(classifyCustomer({ completedOrders: 1, lastOrderAt: now, now })).toBe('NEW');
  });

  it('keeps the exact 60-day boundary recurring', () => {
    const boundary = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1_000);
    expect(classifyCustomer({ completedOrders: 2, lastOrderAt: boundary, now })).toBe('RECURRING');
  });

  it('classifies one millisecond beyond the boundary as lapsed', () => {
    const lapsed = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1_000 - 1);
    expect(classifyCustomer({ completedOrders: 2, lastOrderAt: lapsed, now })).toBe('LAPSED');
  });
});
