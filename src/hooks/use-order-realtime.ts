'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { Channel } from 'pusher-js';

import { privateStoreChannel } from '@/lib/pusher/channels';
import { getPusherClient, isPusherConfigured } from '@/lib/pusher/client';

export type OrderRealtimeState = 'unavailable' | 'connecting' | 'connected' | 'degraded';

interface OrderRealtimeHandlers {
  onNewOrder: (event: { orderId: string; orderNumber: number }) => void;
  onOrderUpdated: (event: { orderId: string }) => void;
  onPaymentUpdated: (event: { orderId: string }) => void;
}

function hasOrderId(value: unknown): value is { orderId: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'orderId' in value &&
    typeof value.orderId === 'string',
  );
}

function isNewOrderEvent(value: unknown): value is { orderId: string; orderNumber: number } {
  return hasOrderId(value) && 'orderNumber' in value && typeof value.orderNumber === 'number';
}

export function useOrderRealtime(
  storeId: string | null,
  handlers: OrderRealtimeHandlers,
): OrderRealtimeState {
  const configured = isPusherConfigured();
  const onNewOrderEvent = useEffectEvent(handlers.onNewOrder);
  const onOrderUpdatedEvent = useEffectEvent(handlers.onOrderUpdated);
  const onPaymentUpdatedEvent = useEffectEvent(handlers.onPaymentUpdated);
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

    const onSubscriptionSucceeded = () => {
      subscribed = true;
      setConnection({ storeId, state: 'connected' });
    };
    const onSubscriptionError = () => {
      subscribed = false;
      setConnection({ storeId, state: 'degraded' });
    };
    const onConnectionChange = (change: { current: string }) => {
      if (change.current === 'connected') {
        setConnection({ storeId, state: subscribed ? 'connected' : 'connecting' });
      } else if (change.current === 'connecting') {
        setConnection({ storeId, state: 'connecting' });
      } else {
        subscribed = false;
        setConnection({ storeId, state: 'degraded' });
      }
    };
    const onNewOrder = (event: unknown) => {
      if (isNewOrderEvent(event)) onNewOrderEvent(event);
    };
    const onOrderUpdated = (event: unknown) => {
      if (hasOrderId(event)) onOrderUpdatedEvent(event);
    };
    const onPaymentUpdated = (event: unknown) => {
      if (hasOrderId(event)) onPaymentUpdatedEvent(event);
    };

    channel.bind('pusher:subscription_succeeded', onSubscriptionSucceeded);
    channel.bind('pusher:subscription_error', onSubscriptionError);
    channel.bind('new-order', onNewOrder);
    channel.bind('order-updated', onOrderUpdated);
    channel.bind('payment-updated', onPaymentUpdated);
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
      client.connection.unbind('state_change', onConnectionChange);
      client.unsubscribe(channelName);
    };
  }, [configured, storeId]);

  if (!configured || !storeId) return 'unavailable';
  return connection.storeId === storeId ? connection.state : 'connecting';
}
