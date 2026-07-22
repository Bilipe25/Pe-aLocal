import 'server-only';

import Pusher from 'pusher';

import { storeEventChannels } from '@/lib/pusher/channels';

// =============================================================================
// Pusher Server — Instância singleton para disparar eventos
// =============================================================================

let pusherInstance: Pusher | null = null;

export function isPusherServerConfigured() {
  return Boolean(
    process.env.PUSHER_APP_ID &&
    process.env.PUSHER_KEY &&
    process.env.PUSHER_SECRET &&
    process.env.PUSHER_CLUSTER
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
        trigger: async () => ({}),
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

export function authorizePusherChannel(socketId: string, channelName: string) {
  return pusherServer.authorizeChannel(socketId, channelName);
}

function eventChannels(storeId: string) {
  return storeEventChannels(
    storeId,
    process.env.PUSHER_LEGACY_PUBLIC_CHANNELS === 'true',
  );
}

// =============================================================================
// Helpers para disparar eventos tipados
// =============================================================================

export async function triggerNewOrder(storeId: string, orderId: string, orderNumber: number) {
  return pusherServer.trigger(eventChannels(storeId), 'new-order', {
    orderId,
    orderNumber,
    timestamp: Date.now(),
  });
}

export async function triggerOrderUpdated(storeId: string, orderId: string, status: string) {
  return pusherServer.trigger(eventChannels(storeId), 'order-updated', {
    orderId,
    status,
    timestamp: Date.now(),
  });
}

export async function triggerPaymentUpdated(storeId: string, orderId: string, paymentStatus: string) {
  return pusherServer.trigger(eventChannels(storeId), 'payment-updated', {
    orderId,
    paymentStatus,
    timestamp: Date.now(),
  });
}
