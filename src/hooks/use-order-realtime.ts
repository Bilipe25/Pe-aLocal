'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { Channel } from 'pusher-js';

import { privateStoreChannel } from '@/lib/pusher/channels';
import { getPusherClient, isPusherConfigured } from '@/lib/pusher/client';

export type OrderRealtimeState = 'unavailable' | 'connecting' | 'connected' | 'degraded';

export interface RealtimeEventEnvelope {
  eventId?: string;
  schemaVersion?: number;
  storeId?: string;
  entity?: 'ORDER' | 'PAYMENT' | 'DINING_ROOM';
  reason?: string;
  version?: number;
  timestamp?: number;
}

interface OrderRealtimeHandlers {
  onNewOrder: (event: RealtimeEventEnvelope & { orderId: string; orderNumber: number }) => void;
  onOrderUpdated: (event: RealtimeEventEnvelope & { orderId: string }) => void;
  onPaymentUpdated: (event: RealtimeEventEnvelope & { orderId: string }) => void;
  onDiningRoomUpdated?: (
    event: RealtimeEventEnvelope & { tableId: string; sessionId: string },
  ) => void;
  onReconcileRequired?: () => void;
}

function hasOrderId(value: unknown): value is { orderId: string } {
  return Boolean(
    value && typeof value === 'object' && 'orderId' in value && typeof value.orderId === 'string',
  );
}

function isNewOrderEvent(value: unknown): value is { orderId: string; orderNumber: number } {
  return hasOrderId(value) && 'orderNumber' in value && typeof value.orderNumber === 'number';
}

function envelopeFor(value: unknown): RealtimeEventEnvelope {
  if (!value || typeof value !== 'object') return {};
  const event = value as Record<string, unknown>;
  return {
    eventId: typeof event.eventId === 'string' ? event.eventId : undefined,
    schemaVersion: typeof event.schemaVersion === 'number' ? event.schemaVersion : undefined,
    storeId: typeof event.storeId === 'string' ? event.storeId : undefined,
    entity:
      event.entity === 'ORDER' || event.entity === 'PAYMENT' || event.entity === 'DINING_ROOM'
        ? event.entity
        : undefined,
    reason: typeof event.reason === 'string' ? event.reason : undefined,
    version: typeof event.version === 'number' ? event.version : undefined,
    timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
  };
}

export function useOrderRealtime(
  storeId: string | null,
  handlers: OrderRealtimeHandlers,
): OrderRealtimeState {
  const configured = isPusherConfigured();
  const onNewOrderEvent = useEffectEvent(handlers.onNewOrder);
  const onOrderUpdatedEvent = useEffectEvent(handlers.onOrderUpdated);
  const onPaymentUpdatedEvent = useEffectEvent(handlers.onPaymentUpdated);
  const onDiningRoomUpdatedEvent = useEffectEvent(
    handlers.onDiningRoomUpdated ?? (() => undefined),
  );
  const onReconcileRequiredEvent = useEffectEvent(
    handlers.onReconcileRequired ?? (() => undefined),
  );
  const [connection, setConnection] = useState<{
    storeId: string | null;
    state: OrderRealtimeState;
  }>({ storeId, state: configured && storeId ? 'connecting' : 'unavailable' });

  useEffect(() => {
    if (!configured || !storeId) return;

    const client = getPusherClient();
    const channelName = privateStoreChannel(storeId);
    const channel: Channel = client.subscribe(channelName);
    let active = true;
    let subscribed = channel.subscribed;
    let everSubscribed = channel.subscribed;
    let needsReconcile = false;
    const processedEventIds = new Map<string, number>();

    const reconcileIfNeeded = () => {
      if (!needsReconcile) return;
      needsReconcile = false;
      onReconcileRequiredEvent();
    };
    const shouldProcess = (kind: string, value: unknown) => {
      const envelope = envelopeFor(value);
      if (envelope.storeId && envelope.storeId !== storeId) return false;
      if (envelope.schemaVersion && envelope.schemaVersion !== 1) {
        onReconcileRequiredEvent();
        return false;
      }
      const dedupeKey = envelope.eventId
        ? `${kind}:${envelope.eventId}`
        : envelope.version !== undefined && envelope.timestamp !== undefined && hasOrderId(value)
          ? `${kind}:${value.orderId}:${envelope.version}:${envelope.timestamp}`
          : null;
      if (!dedupeKey) return true;
      if (processedEventIds.has(dedupeKey)) return false;
      processedEventIds.set(dedupeKey, Date.now());
      while (processedEventIds.size > 512) {
        const oldest = processedEventIds.keys().next().value;
        if (!oldest) break;
        processedEventIds.delete(oldest);
      }
      return true;
    };

    const onSubscriptionSucceeded = () => {
      subscribed = true;
      setConnection({ storeId, state: 'connected' });
      if (everSubscribed) needsReconcile = true;
      everSubscribed = true;
      reconcileIfNeeded();
    };
    const onSubscriptionError = () => {
      subscribed = false;
      needsReconcile = everSubscribed;
      setConnection({ storeId, state: 'degraded' });
    };
    const onConnectionChange = (change: { current: string }) => {
      if (change.current === 'connected') {
        setConnection({ storeId, state: subscribed ? 'connected' : 'connecting' });
        if (subscribed) reconcileIfNeeded();
      } else if (change.current === 'connecting') {
        setConnection({ storeId, state: 'connecting' });
      } else {
        needsReconcile = everSubscribed;
        subscribed = false;
        setConnection({ storeId, state: 'degraded' });
      }
    };
    const onNewOrder = (event: unknown) => {
      if (isNewOrderEvent(event) && shouldProcess('new-order', event)) onNewOrderEvent(event);
    };
    const onOrderUpdated = (event: unknown) => {
      if (hasOrderId(event) && shouldProcess('order-updated', event)) onOrderUpdatedEvent(event);
    };
    const onPaymentUpdated = (event: unknown) => {
      if (hasOrderId(event) && shouldProcess('payment-updated', event))
        onPaymentUpdatedEvent(event);
    };
    const onDiningRoomUpdated = (event: unknown) => {
      if (
        event &&
        typeof event === 'object' &&
        'tableId' in event &&
        typeof event.tableId === 'string' &&
        'sessionId' in event &&
        typeof event.sessionId === 'string' &&
        shouldProcess('dining-room-updated', event)
      ) {
        onDiningRoomUpdatedEvent({
          ...envelopeFor(event),
          tableId: event.tableId,
          sessionId: event.sessionId,
        });
      }
    };

    channel.bind('pusher:subscription_succeeded', onSubscriptionSucceeded);
    channel.bind('pusher:subscription_error', onSubscriptionError);
    channel.bind('new-order', onNewOrder);
    channel.bind('order-updated', onOrderUpdated);
    channel.bind('payment-updated', onPaymentUpdated);
    channel.bind('dining-room-updated', onDiningRoomUpdated);
    client.connection.bind('state_change', onConnectionChange);

    if (subscribed) {
      queueMicrotask(() => {
        if (active) setConnection({ storeId, state: 'connected' });
      });
    }

    return () => {
      active = false;
      channel.unbind('pusher:subscription_succeeded', onSubscriptionSucceeded);
      channel.unbind('pusher:subscription_error', onSubscriptionError);
      channel.unbind('new-order', onNewOrder);
      channel.unbind('order-updated', onOrderUpdated);
      channel.unbind('payment-updated', onPaymentUpdated);
      channel.unbind('dining-room-updated', onDiningRoomUpdated);
      client.connection.unbind('state_change', onConnectionChange);
      client.unsubscribe(channelName);
    };
  }, [configured, storeId]);

  if (!configured || !storeId) return 'unavailable';
  return connection.storeId === storeId ? connection.state : 'connecting';
}
