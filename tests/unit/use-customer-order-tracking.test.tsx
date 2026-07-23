import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCustomerOrderTracking } from '@/hooks/use-customer-order-tracking';

const mocks = vi.hoisted(() => {
  const channelHandlers = new Map<string, (value?: unknown) => void>();
  const connectionHandlers = new Map<string, (value: { current: string }) => void>();
  const channel = {
    subscribed: false,
    bind: vi.fn((event: string, handler: (value?: unknown) => void) =>
      channelHandlers.set(event, handler),
    ),
    unbind: vi.fn((event: string) => channelHandlers.delete(event)),
  };
  const client = {
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
    disconnect: vi.fn(),
    connection: {
      bind: vi.fn((event: string, handler: (value: { current: string }) => void) =>
        connectionHandlers.set(event, handler),
      ),
      unbind: vi.fn((event: string) => connectionHandlers.delete(event)),
    },
  };
  const routerRefresh = vi.fn();
  return {
    channelHandlers,
    connectionHandlers,
    channel,
    client,
    routerRefresh,
    router: { refresh: routerRefresh },
  };
});

vi.mock('pusher-js', () => ({
  default: vi.fn(function MockPusherClient() {
    return mocks.client;
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

const initialState = {
  orderNumber: 42,
  modality: 'PICKUP' as const,
  status: 'PENDING' as const,
  paymentStatus: 'PENDING' as const,
  version: 0,
  statusChangedAt: '2026-07-22T12:00:00.000Z',
  updatedAt: '2026-07-22T12:00:00.000Z',
  estimate: null,
  cancellationMessage: null,
};

const nextState = {
  ...initialState,
  status: 'CONFIRMED' as const,
  version: 1,
  statusChangedAt: '2026-07-22T12:01:00.000Z',
  updatedAt: '2026-07-22T12:01:00.000Z',
};

describe('acompanhamento automático do cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channelHandlers.clear();
    mocks.connectionHandlers.clear();
    mocks.channel.subscribed = false;
    process.env.NEXT_PUBLIC_PUSHER_KEY = 'test-key';
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER = 'test-cluster';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(nextState), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconcilia o estado pelo endpoint ao receber evento privado mínimo', async () => {
    const { result, unmount } = renderHook(() =>
      useCustomerOrderTracking({
        publicToken: '4da03571-bffd-45ef-8c44-20686c487838',
        storeSlug: 'burger-do-ze',
        channelName: `private-order-${'a'.repeat(64)}`,
        initialState,
      }),
    );

    act(() => mocks.channelHandlers.get('pusher:subscription_succeeded')?.());
    expect(result.current.connection).toBe('connected');
    await act(async () => {
      mocks.channelHandlers.get('tracking-updated')?.({
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        version: 1,
        timestamp: Date.now(),
      });
    });

    await waitFor(() => expect(result.current.state.status).toBe('CONFIRMED'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/orders/track/4da03571-bffd-45ef-8c44-20686c487838?storeSlug=burger-do-ze',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.client.disconnect).toHaveBeenCalledOnce();
  });

  it('mantém polling de vinte segundos quando o Pusher não está configurado', async () => {
    delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    delete process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useCustomerOrderTracking({
        publicToken: '4da03571-bffd-45ef-8c44-20686c487838',
        storeSlug: 'burger-do-ze',
        channelName: `private-order-${'a'.repeat(64)}`,
        initialState,
      }),
    );

    expect(result.current.connection).toBe('unavailable');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe('CONFIRMED');
  });
});
