'use client';

import PusherClient from 'pusher-js';

// =============================================================================
// Pusher Client — Instância singleton para escutar eventos
// =============================================================================

let pusherClientInstance: PusherClient | null = null;

export function isPusherConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
}

export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.warn('[PUSHER] Client env vars not set. Real-time disabled.');
      // Retorna um mock mínimo
      return {
        subscribe: () => ({
          bind: () => {},
          unbind: () => {},
          unbind_all: () => {},
        }),
        unsubscribe: () => {},
        disconnect: () => {},
      } as unknown as PusherClient;
    }

    pusherClientInstance = new PusherClient(key, {
      cluster,
    });
  }

  return pusherClientInstance;
}
