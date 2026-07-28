'use client';

import type Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CustomerOrderTrackingSignalDTO,
  CustomerOrderTrackingStateDTO,
} from '@/types/order-tracking';

export type CustomerTrackingConnection = 'unavailable' | 'connecting' | 'connected' | 'degraded';

function isExpiredTokenResponse(value: unknown) {
  return Boolean(
    value && typeof value === 'object' && 'code' in value && value.code === 'TOKEN_EXPIRED',
  );
}

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
  onExpired,
}: {
  publicToken: string;
  storeSlug: string;
  channelName: string;
  initialState: CustomerOrderTrackingStateDTO;
  onExpired?: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<CustomerOrderTrackingStateDTO | null>(initialState);
  const latestState = useRef<CustomerOrderTrackingStateDTO | null>(initialState);
  const activeRequest = useRef<Promise<void> | null>(null);
  const expiredRef = useRef(false);
  const [expired, setExpired] = useState(false);
  const [lastSynchronizedAt, setLastSynchronizedAt] = useState(initialState.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const configured = Boolean(
    process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  );
  const [connection, setConnection] = useState<CustomerTrackingConnection>(
    configured ? 'connecting' : 'unavailable',
  );

  const expireAccess = useCallback(() => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    latestState.current = null;
    setState(null);
    setExpired(true);
    setError(null);
    setConnection('unavailable');
    onExpired?.();
    router.refresh();
  }, [onExpired, router]);

  const refresh = useCallback(async () => {
    if (expiredRef.current) return;
    if (activeRequest.current) return activeRequest.current;
    const request = (async () => {
      setIsRefreshing(true);
      try {
        const response = await fetch(
          `/api/orders/track/${encodeURIComponent(publicToken)}?storeSlug=${encodeURIComponent(storeSlug)}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        if (response.status === 410) {
          const payload: unknown = await response.json().catch(() => null);
          if (isExpiredTokenResponse(payload)) {
            expireAccess();
            return;
          }
        }
        if (!response.ok) throw new Error('tracking-unavailable');
        const nextState = (await response.json()) as CustomerOrderTrackingStateDTO;
        if (expiredRef.current) return;
        const changed =
          !latestState.current ||
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
  }, [expireAccess, publicToken, router, storeSlug]);

  useEffect(() => {
    if (expired) return;
    let stopped = false;
    let timeout: number | undefined;

    const clearScheduledPoll = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
    };
    const canPoll = () => document.visibilityState === 'visible' && navigator.onLine;
    const scheduleNextPoll = () => {
      clearScheduledPoll();
      if (stopped || !canPoll()) return;
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void refreshAndSchedule();
      }, 20_000);
    };
    const refreshAndSchedule = async () => {
      if (stopped || !canPoll()) return;
      clearScheduledPoll();
      await refresh();
      scheduleNextPoll();
    };
    const resumePolling = () => {
      if (canPoll()) {
        void refreshAndSchedule();
      } else {
        clearScheduledPoll();
      }
    };

    scheduleNextPoll();
    window.addEventListener('focus', resumePolling);
    window.addEventListener('online', resumePolling);
    window.addEventListener('offline', clearScheduledPoll);
    document.addEventListener('visibilitychange', resumePolling);
    return () => {
      stopped = true;
      clearScheduledPoll();
      window.removeEventListener('focus', resumePolling);
      window.removeEventListener('online', resumePolling);
      window.removeEventListener('offline', clearScheduledPoll);
      document.removeEventListener('visibilitychange', resumePolling);
    };
  }, [expired, refresh]);

  useEffect(() => {
    if (!configured || expired) return;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    let stopped = false;
    let client: Pusher | null = null;
    let channel: Channel | null = null;
    let subscribed = false;

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
      if (
        isTrackingSignal(event) &&
        latestState.current &&
        event.version >= latestState.current.version
      ) {
        void refresh();
      }
    };

    const connect = async () => {
      try {
        const { default: PusherClient } = await import('pusher-js');
        if (stopped) return;

        client = new PusherClient(key, {
          cluster,
          channelAuthorization: {
            endpoint: `/api/orders/track/${encodeURIComponent(publicToken)}/pusher-auth?storeSlug=${encodeURIComponent(storeSlug)}`,
            transport: 'ajax',
          },
        });
        channel = client.subscribe(channelName);
        subscribed = channel.subscribed;
        channel.bind('pusher:subscription_succeeded', onSubscribed);
        channel.bind('pusher:subscription_error', onSubscriptionError);
        channel.bind('tracking-updated', onTrackingUpdated);
        client.connection.bind('state_change', onConnectionChange);
        if (subscribed) queueMicrotask(() => setConnection('connected'));
      } catch {
        if (!stopped) setConnection('degraded');
      }
    };

    queueMicrotask(() => {
      if (!stopped) setConnection('connecting');
    });
    void connect();

    return () => {
      stopped = true;
      channel?.unbind('pusher:subscription_succeeded', onSubscribed);
      channel?.unbind('pusher:subscription_error', onSubscriptionError);
      channel?.unbind('tracking-updated', onTrackingUpdated);
      client?.connection.unbind('state_change', onConnectionChange);
      client?.unsubscribe(channelName);
      client?.disconnect();
    };
  }, [channelName, configured, expired, publicToken, refresh, storeSlug]);

  return {
    state,
    expired,
    connection,
    lastSynchronizedAt,
    error,
    isRefreshing,
    refresh,
  };
}
