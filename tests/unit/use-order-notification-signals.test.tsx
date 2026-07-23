import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrderNotificationSignals } from '@/hooks/use-orders';

const mocks = vi.hoisted(() => ({
  getOrderNotificationSignalsAction: vi.fn(),
}));
const baseline = {
  items: [],
  processedEventIds: ['event-0'],
  nextCursor: 'baseline',
  hasMore: false,
};

vi.mock('@/features/orders/query-actions', () => ({
  getOrderNotificationSignalsAction: mocks.getOrderNotificationSignalsAction,
}));

describe('useOrderNotificationSignals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserva o cursor quando o intervalo muda durante a conexão', async () => {
    const onSignals = vi.fn();
    mocks.getOrderNotificationSignalsAction
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], processedEventIds: ['event-1'], nextCursor: 'cursor-1', hasMore: false },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{
            eventId: 'event-2',
            orderId: 'order-2',
            orderNumber: 2,
            isNew: true,
            createdAt: '2026-07-22T12:00:00.000Z',
          }],
          processedEventIds: ['event-2'],
          nextCursor: 'cursor-2',
          hasMore: false,
        },
      });
    const { rerender } = renderHook(
      ({ interval, initialBaseline }) => useOrderNotificationSignals(
        'store-a',
        'scope-a',
        initialBaseline,
        interval,
        onSignals,
        vi.fn(),
      ),
      { initialProps: { interval: 20_000, initialBaseline: baseline } },
    );
    await act(async () => vi.advanceTimersByTimeAsync(0));
    rerender({
      interval: 60_000,
      initialBaseline: { ...baseline, nextCursor: 'replacement-baseline' },
    });

    await act(async () => vi.advanceTimersByTimeAsync(20_000));

    expect(mocks.getOrderNotificationSignalsAction).toHaveBeenNthCalledWith(2, {
      cursor: 'cursor-1',
      seenEventIds: ['event-0', 'event-1'],
    });
    expect(onSignals).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'event-2', orderId: 'order-2' }),
    ]);
  });

  it('pausa em aba oculta e consulta imediatamente ao voltar', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    mocks.getOrderNotificationSignalsAction.mockResolvedValue({
      success: true,
      data: { items: [], processedEventIds: [], nextCursor: 'cursor-1', hasMore: false },
    });
    renderHook(() => useOrderNotificationSignals(
      'store-a',
      'scope-a',
      baseline,
      20_000,
      vi.fn(),
      vi.fn(),
    ));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.getOrderNotificationSignalsAction).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.getOrderNotificationSignalsAction).toHaveBeenCalledOnce();
  });

  it('drena páginas pendentes no mesmo ciclo', async () => {
    const onSignals = vi.fn();
    mocks.getOrderNotificationSignalsAction
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ eventId: 'event-1', orderId: 'order-1', orderNumber: 1, isNew: true }],
          processedEventIds: ['event-1'],
          nextCursor: 'page-1',
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ eventId: 'event-2', orderId: 'order-2', orderNumber: 2, isNew: true }],
          processedEventIds: ['event-2'],
          nextCursor: 'page-2',
          hasMore: false,
        },
      });
    renderHook(() => useOrderNotificationSignals(
      'store-a',
      'scope-a',
      baseline,
      20_000,
      onSignals,
      vi.fn(),
    ));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(mocks.getOrderNotificationSignalsAction).toHaveBeenCalledTimes(2);
    expect(mocks.getOrderNotificationSignalsAction).toHaveBeenNthCalledWith(2, {
      cursor: 'page-1',
      seenEventIds: ['event-0', 'event-1'],
    });
    expect(onSignals).toHaveBeenCalledTimes(1);
    expect(onSignals).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 'event-1' }),
      expect.objectContaining({ eventId: 'event-2' }),
    ]);
  });

  it('solicita reconciliação da fila após três falhas consecutivas', async () => {
    const reconcile = vi.fn();
    mocks.getOrderNotificationSignalsAction.mockRejectedValue(new Error('unavailable'));
    renderHook(() => useOrderNotificationSignals(
      'store-a',
      'scope-a',
      baseline,
      20_000,
      vi.fn(),
      reconcile,
    ));

    await act(async () => vi.advanceTimersByTimeAsync(40_000));

    expect(mocks.getOrderNotificationSignalsAction).toHaveBeenCalledTimes(3);
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
