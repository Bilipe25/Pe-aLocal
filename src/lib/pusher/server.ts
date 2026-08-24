import 'server-only';

import Pusher from 'pusher';

import { storeEventChannels } from '@/lib/pusher/channels';
import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { createPusherHttpClient, type PusherHttpClient } from '@/lib/pusher/http-client';
import { getDb } from '@/server/database/client';

// =============================================================================
// Pusher Server — Instância singleton para disparar eventos
// =============================================================================

let pusherInstance: Pusher | null = null;
let pusherHttpClient: PusherHttpClient | null = null;

export function isPusherServerConfigured() {
  return Boolean(
    process.env.PUSHER_APP_ID &&
    process.env.PUSHER_KEY &&
    process.env.PUSHER_SECRET &&
    process.env.PUSHER_CLUSTER,
  );
}

function getPusherServer(): Pusher {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
      // Retorna instância dummy se não configurado (dev sem Pusher)
      console.warn('[PUSHER] Variáveis de ambiente não configuradas. Real-time desabilitado.');
      return {
        trigger: async () => {
          throw new Error('Pusher server is not configured.');
        },
      } as unknown as Pusher;
    }

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
      timeout: 5_000,
    });
  }

  return pusherInstance;
}

export const pusherServer = getPusherServer();

function getPusherHttpClient(): PusherHttpClient {
  if (pusherHttpClient) return pusherHttpClient;
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) {
    return {
      trigger: async () => {
        throw new Error('Pusher server is not configured.');
      },
    };
  }
  pusherHttpClient = createPusherHttpClient({ appId, key, secret, cluster });
  return pusherHttpClient;
}

export function authorizePusherChannel(socketId: string, channelName: string) {
  return pusherServer.authorizeChannel(socketId, channelName);
}

function eventChannels(storeId: string) {
  return storeEventChannels(storeId, process.env.PUSHER_LEGACY_PUBLIC_CHANNELS === 'true');
}

async function triggerCustomerTracking(orderId: string) {
  const order = await getDb().order.findUnique({
    where: { id: orderId },
    select: {
      publicToken: true,
      status: true,
      paymentStatus: true,
      version: true,
      updatedAt: true,
    },
  });
  if (!order) return null;
  return getPusherHttpClient().trigger(
    await privateCustomerOrderChannel(order.publicToken),
    'tracking-updated',
    {
      status: order.status,
      paymentStatus: order.paymentStatus,
      version: order.version,
      timestamp: order.updatedAt.getTime(),
    },
  );
}

// =============================================================================
// Helpers para disparar eventos tipados
// =============================================================================

export async function triggerNewOrder(storeId: string, orderId: string, orderNumber: number) {
  return Promise.all([
    getPusherHttpClient().trigger(eventChannels(storeId), 'new-order', {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      storeId,
      entity: 'ORDER',
      reason: 'ORDER_CREATED',
      orderId,
      orderNumber,
      timestamp: Date.now(),
    }),
    triggerCustomerTracking(orderId),
  ]);
}

export async function triggerOrderUpdated(
  storeId: string,
  orderId: string,
  status: string,
  options: { notifyCustomer?: boolean } = {},
) {
  const publications: Promise<unknown>[] = [
    getPusherHttpClient().trigger(eventChannels(storeId), 'order-updated', {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      storeId,
      entity: 'ORDER',
      reason: 'ORDER_UPDATED',
      orderId,
      status,
      timestamp: Date.now(),
    }),
  ];
  if (options.notifyCustomer !== false) {
    publications.push(triggerCustomerTracking(orderId));
  }
  return Promise.all(publications);
}

export async function triggerPaymentUpdated(
  storeId: string,
  orderId: string,
  paymentStatus: string,
) {
  return Promise.all([
    getPusherHttpClient().trigger(eventChannels(storeId), 'payment-updated', {
      eventId: crypto.randomUUID(),
      schemaVersion: 1,
      storeId,
      entity: 'PAYMENT',
      reason: 'PAYMENT_UPDATED',
      orderId,
      paymentStatus,
      timestamp: Date.now(),
    }),
    triggerCustomerTracking(orderId),
  ]);
}

export type DiningRoomInvalidationReason =
  'ORDER_ATTACHED' | 'REQUEST_OPENED' | 'REQUEST_RESOLVED' | 'TRANSFERRED' | 'CLOSED';

export async function triggerDiningRoomUpdated(
  storeId: string,
  input: {
    eventId?: string;
    tableId: string;
    sessionId: string;
    reason: DiningRoomInvalidationReason;
    version: number;
  },
) {
  return getPusherHttpClient().trigger(eventChannels(storeId), 'dining-room-updated', {
    eventId: input.eventId ?? crypto.randomUUID(),
    schemaVersion: 1,
    storeId,
    entity: 'DINING_ROOM',
    tableId: input.tableId,
    sessionId: input.sessionId,
    reason: input.reason,
    version: input.version,
    timestamp: Date.now(),
  });
}
