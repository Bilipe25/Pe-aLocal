import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPaymentReportToken,
  readPaymentReportToken,
  storePaymentReportToken,
  subscribeToPaymentReportToken,
} from '@/lib/orders/payment-report-token-memory';

const PUBLIC_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('payment report token em memória', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
    clearPaymentReportToken(PUBLIC_TOKEN);
  });

  afterEach(() => {
    clearPaymentReportToken(PUBLIC_TOKEN);
    vi.useRealTimers();
  });

  it('mantém o token somente durante o runtime e notifica assinantes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPaymentReportToken(PUBLIC_TOKEN, listener);

    storePaymentReportToken(PUBLIC_TOKEN, 'report-token-a');

    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBe('report-token-a');
    expect(listener).toHaveBeenCalledOnce();

    clearPaymentReportToken(PUBLIC_TOKEN);
    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('expira e remove o token ao atingir o TTL', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToPaymentReportToken(PUBLIC_TOKEN, listener);
    storePaymentReportToken(PUBLIC_TOKEN, 'report-token-a', 1_000);

    vi.advanceTimersByTime(1_000);

    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('ignora entradas inválidas em vez de mantê-las na memória', () => {
    storePaymentReportToken(PUBLIC_TOKEN, '', 1_000);
    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBeNull();

    storePaymentReportToken(PUBLIC_TOKEN, 'report-token-a', 0);
    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBeNull();
  });
});
