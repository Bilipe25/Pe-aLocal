import type { OperationalOutboxEventType, OrderOutboxEventType } from '@prisma/client';

import {
  diningRoomOperationalPayloadSchema,
  type DiningRoomOperationalPayload,
} from '@/domain/operational-events';
import { orderEventPayloadSchema, type OrderEventPayload } from '@/domain/orders/order-events';
import { storeEventChannels } from '@/lib/pusher/channels';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { createPusherHttpClient } from '@/lib/pusher/http-client';

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

export interface OperationalRealtimeEvent {
  id: string;
  storeId: string;
  eventType: OperationalOutboxEventType;
  schemaVersion: number;
  payload: unknown;
}

export interface OperationalEventPublisher {
  publish(event: OperationalRealtimeEvent): Promise<void>;
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
    storeId: event.storeId,
    entity: event.eventType === 'PAYMENT_UPDATED' ? 'PAYMENT' : 'ORDER',
    reason: event.eventType,
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

function diningRoomRealtimePayload(
  event: OperationalRealtimeEvent,
  payload: DiningRoomOperationalPayload,
) {
  return {
    eventId: event.id,
    schemaVersion: event.schemaVersion,
    storeId: event.storeId,
    entity: 'DINING_ROOM',
    tableId: payload.tableId,
    sessionId: payload.sessionId,
    reason: payload.reason,
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
  fetch?: typeof globalThis.fetch;
}): OrderEventPublisher {
  const pusher = createPusherHttpClient({
    appId: config.appId,
    key: config.key,
    secret: config.secret,
    cluster: config.cluster,
    fetch: config.fetch,
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

export function createOperationalEventPublisher(config: {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  includeLegacyPublicChannel: boolean;
  fetch?: typeof globalThis.fetch;
}): OperationalEventPublisher {
  const pusher = createPusherHttpClient(config);
  return {
    async publish(event) {
      const payload = diningRoomOperationalPayloadSchema.parse(event.payload);
      await pusher.trigger(
        storeEventChannels(event.storeId, config.includeLegacyPublicChannel),
        'dining-room-updated',
        diningRoomRealtimePayload(event, payload),
      );
    },
  };
}
