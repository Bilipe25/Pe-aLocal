'use client';

import PusherClient, { type Channel } from 'pusher-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CustomerOrderTrackingSignalDTO,
  CustomerOrderTrackingStateDTO,
} from '@/types/order-tracking';

export type CustomerTrackingConnection = 'unavailable' | 'connecting' | 'connected' | 'degraded';

function isTrackingSignal(value: unknown): value is CustomerOrderTrackingSignalDTO {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'paymentStatus' in value &&
    typeof value.paymentStatus === 'string' &&
    'version' in value &&
    typeof value.version === 'number' &&
    'timestamp' in value &&
    typeof value.timestamp === 'number',
  );
}

export function useCustomerOrderTracking({
  publicToken,
  storeSlug,
  channelName,
  initialState,
}: {
  publicToken: string;
  storeSlug: string;
  channelName: string;
  initialState: CustomerOrderTrackingStateDTO;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const latestState = useRef(initialState);
  const activeRequest = useRef<Promise<void> | null>(null);
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState(initialState.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const configured = Boolean(
    process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  );
  const [connection, setConnection] = useState<CustomerTrackingConnection>(
    configured ? 'connecting' : 'unavailable',
  );

  const refresh = useCallback(async () => {
    if (activeRequest.current) return activeRequest.current;
    const request = (async () => {
      setIsRefreshing(true);
      try {
        const response = await fetch(
          `/api/orders/track/${encodeURIComponent(publicToken)}?storeSlug=${encodeURIComponent(storeSlug)}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        if (!response.ok) throw new Error('tracking-unavailable');
        const nextState = (await response.json()) as CustomerOrderTrackingStateDTO;
        const changed =
          nextState.version !== latestState.current.version ||
          nextState.status !== latestState.current.status ||
          nextState.paymentStatus !== latestState.current.paymentStatus;
        latestState.current = nextState;
        setState(nextState);
        setLastSynchronizedAt(new Date().toISOString());
        setError(null);
        if (changed) router.refresh();
      } catch {
        setError('Não foi possível buscar a atualização agora. O último estado continua visível.');
      } finally {
        setIsRefreshing(false);
        activeRequest.current = null;
      }
    })();
    activeRequest.current = request;
    return request;
  }, [publicToken, router, storeSlug]);

  useEffect(() => {
    let stopped = false;
    let timeout: number | undefined;
    const poll = async () => {
      if (stopped || document.visibilityState === 'hidden') return;
      await refresh();
      if (!stopped) timeout = window.setTimeout(poll, 20_000);
    };
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    timeout = window.setTimeout(poll, 20_000);
    window.addEventListener('focus', whenVisible);
    window.addEventListener('online', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      window.removeEventListener('focus', whenVisible);
      window.removeEventListener('online', whenVisible);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!configured) return;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const client = new PusherClient(key, {
      cluster,
      channelAuthorization: {
        endpoint: `/api/orders/track/${encodeURIComponent(publicToken)}/pusher-auth?storeSlug=${encodeURIComponent(storeSlug)}`,
        transport: 'ajax',
      },
    });
    const channel: Channel = client.subscribe(channelName);
    let subscribed = channel.subscribed;
    const onSubscribed = () => {
      subscribed = true;
      setConnection('connected');
    };
    const onSubscriptionError = () => {
      subscribed = false;
      setConnection('degraded');
    };
    const onConnectionChange = (change: { current: string }) => {
      if (change.current === 'connected') {
        setConnection(subscribed ? 'connected' : 'connecting');
      } else if (change.current === 'connecting') {
        setConnection('connecting');
      } else {
        subscribed = false;
        setConnection('degraded');
      }
    };
    const onTrackingUpdated = (event: unknown) => {
      if (isTrackingSignal(event) && event.version >= latestState.current.version) {
        void refresh();
      }
    };

    channel.bind('pusher:subscription_succeeded', onSubscribed);
    channel.bind('pusher:subscription_error', onSubscriptionError);
    channel.bind('tracking-updated', onTrackingUpdated);
    client.connection.bind('state_change', onConnectionChange);
    if (subscribed) queueMicrotask(() => setConnection('connected'));

    return () => {
      channel.unbind('pusher:subscription_succeeded', onSubscribed);
      channel.unbind('pusher:subscription_error', onSubscriptionError);
      channel.unbind('tracking-updated', onTrackingUpdated);
      client.connection.unbind('state_change', onConnectionChange);
      client.unsubscribe(channelName);
      client.disconnect();
    };
  }, [channelName, configured, publicToken, refresh, storeSlug]);

  return {
    state,
    connection,
    lastSynchronizedAt,
    error,
    isRefreshing,
    refresh,
  };
}
