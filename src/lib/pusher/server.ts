import 'server-only';

import Pusher from 'pusher';

// =============================================================================
// Pusher Server — Instância singleton para disparar eventos
// =============================================================================

let pusherInstance: Pusher | null = null;

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
    });
  }

  return pusherInstance;
}

export const pusherServer = getPusherServer();

// =============================================================================
// Helpers para disparar eventos tipados
// =============================================================================

export async function triggerNewOrder(storeId: string, orderId: string, orderNumber: number) {
  return pusherServer.trigger(`store-${storeId}`, 'new-order', {
    orderId,
    orderNumber,
    timestamp: Date.now(),
  });
}

export async function triggerOrderUpdated(storeId: string, orderId: string, status: string) {
  return pusherServer.trigger(`store-${storeId}`, 'order-updated', {
    orderId,
    status,
    timestamp: Date.now(),
  });
}

export async function triggerPaymentUpdated(storeId: string, orderId: string, paymentStatus: string) {
  return pusherServer.trigger(`store-${storeId}`, 'payment-updated', {
    orderId,
    paymentStatus,
    timestamp: Date.now(),
  });
}
