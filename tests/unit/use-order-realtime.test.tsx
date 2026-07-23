import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrderRealtime } from '@/hooks/use-order-realtime';

const mocks = vi.hoisted(() => {
  const channelHandlers = new Map<string, (value?: unknown) => void>();
  const connectionHandlers = new Map<string, (value: { current: string }) => void>();
  const channel = {
    subscribed: false,
    bind: vi.fn((event: string, handler: (value?: unknown) => void) => channelHandlers.set(event, handler)),
    unbind: vi.fn((event: string) => channelHandlers.delete(event)),
  };
  const client = {
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
    connection: {
      bind: vi.fn((event: string, handler: (value: { current: string }) => void) => connectionHandlers.set(event, handler)),
      unbind: vi.fn((event: string) => connectionHandlers.delete(event)),
    },
  };
  return { channelHandlers, connectionHandlers, channel, client };
});

vi.mock('@/lib/pusher/client', () => ({
  isPusherConfigured: () => true,
  getPusherClient: () => mocks.client,
}));

describe('useOrderRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channelHandlers.clear();
    mocks.connectionHandlers.clear();
    mocks.channel.subscribed = false;
  });

  it('mantém uma assinatura privada para todos os eventos e limpa uma vez', () => {
    const onNewOrder = vi.fn();
    const onOrderUpdated = vi.fn();
    const onPaymentUpdated = vi.fn();
    const { result, unmount } = renderHook(() => useOrderRealtime(
      '4da03571-bffd-45ef-8c44-20686c487838',
      { onNewOrder, onOrderUpdated, onPaymentUpdated },
    ));

    expect(mocks.client.subscribe).toHaveBeenCalledOnce();
    expect(mocks.client.subscribe).toHaveBeenCalledWith(
      'private-store-4da03571-bffd-45ef-8c44-20686c487838',
    );
    act(() => mocks.channelHandlers.get('pusher:subscription_succeeded')?.());
    expect(result.current).toBe('connected');

    act(() => mocks.channelHandlers.get('new-order')?.({ orderId: 'order-a', orderNumber: 12 }));
    act(() => mocks.channelHandlers.get('order-updated')?.({ orderId: 'order-a' }));
    act(() => mocks.channelHandlers.get('payment-updated')?.({ orderId: 'order-a' }));
    expect(onNewOrder).toHaveBeenCalledWith({ orderId: 'order-a', orderNumber: 12 });
    expect(onOrderUpdated).toHaveBeenCalledWith({ orderId: 'order-a' });
    expect(onPaymentUpdated).toHaveBeenCalledWith({ orderId: 'order-a' });

    unmount();
    expect(mocks.client.unsubscribe).toHaveBeenCalledOnce();
  });

  it('expõe modo degradado quando a assinatura falha', () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useOrderRealtime(
      '4da03571-bffd-45ef-8c44-20686c487838',
      { onNewOrder: handler, onOrderUpdated: handler, onPaymentUpdated: handler },
    ));

    act(() => mocks.channelHandlers.get('pusher:subscription_error')?.());

    expect(result.current).toBe('degraded');
  });
});
