import Pusher from 'pusher';
import type { OrderOutboxEventType } from '@prisma/client';

import { orderEventPayloadSchema, type OrderEventPayload } from '@/domain/orders/order-events';
import { storeEventChannels } from '@/lib/pusher/channels';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';

export interface OrderRealtimeEvent {
  id: string;
  storeId: string;
  eventType: OrderOutboxEventType;
  schemaVersion: number;
  payload: unknown;
}

export interface OrderEventPublisher {
  publish(event: OrderRealtimeEvent): Promise<void>;
}

function pusherEventName(eventType: OrderOutboxEventType) {
  if (eventType === 'ORDER_CREATED') return 'new-order';
  if (eventType === 'PAYMENT_UPDATED') return 'payment-updated';
  return 'order-updated';
}

function realtimePayload(event: OrderRealtimeEvent, payload: OrderEventPayload) {
  return {
    eventId: event.id,
    schemaVersion: event.schemaVersion,
    orderId: payload.orderId,
    orderNumber: payload.orderNumber,
    status: payload.status,
    paymentStatus: payload.paymentStatus,
    version: payload.version,
    timestamp: Date.parse(payload.occurredAt),
  };
}

function customerTrackingPayload(payload: OrderEventPayload) {
  return {
    status: payload.status,
    paymentStatus: payload.paymentStatus,
    version: payload.version,
    timestamp: Date.parse(payload.occurredAt),
  };
}

export function createOrderEventPublisher(config: {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  includeLegacyPublicChannel: boolean;
  resolvePublicToken?: (orderId: string) => Promise<string | null>;
}): OrderEventPublisher {
  const pusher = new Pusher({
    appId: config.appId,
    key: config.key,
    secret: config.secret,
    cluster: config.cluster,
    useTLS: true,
    timeout: 5_000,
  });

  return {
    async publish(event) {
      const payload = orderEventPayloadSchema.parse(event.payload);
      await pusher.trigger(
        storeEventChannels(event.storeId, config.includeLegacyPublicChannel),
        pusherEventName(event.eventType),
        realtimePayload(event, payload),
      );
      if (event.eventType === 'ORDER_INTERNAL_NOTE_ADDED') return;

      const publicToken = await config.resolvePublicToken?.(payload.orderId);
      if (publicToken) {
        await pusher.trigger(
          await privateCustomerOrderChannel(publicToken),
          'tracking-updated',
          customerTrackingPayload(payload),
        );
      }
    },
  };
}
