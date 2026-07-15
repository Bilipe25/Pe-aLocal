'use client';

import { useEffect, useRef } from 'react';
import { getPusherClient } from '@/lib/pusher/client';
import type { Channel } from 'pusher-js';

// =============================================================================
// usePusherChannel — Hook para se inscrever em eventos de um canal Pusher
// =============================================================================

/**
 * Se inscreve em um canal Pusher e chama o callback quando o evento ocorre.
 *
 * @param channelName Nome do canal (ex: `store-${storeId}`)
 * @param eventName Nome do evento (ex: 'new-order')
 * @param callback Função chamada com o payload do evento
 */
export function usePusherChannel<T = unknown>(
  channelName: string | null,
  eventName: string,
  callback: (data: T) => void,
) {
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!channelName) return;

    const client = getPusherClient();
    const channel: Channel = client.subscribe(channelName);

    const handler = (data: T) => {
      callbackRef.current(data);
    };

    channel.bind(eventName, handler);

    return () => {
      channel.unbind(eventName, handler);
      client.unsubscribe(channelName);
    };
  }, [channelName, eventName]);
}
