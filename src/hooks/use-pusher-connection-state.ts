'use client';

import { useEffect, useState } from 'react';

import { getPusherClient, isPusherConfigured } from '@/lib/pusher/client';

export type RealtimeConnectionState = 'unavailable' | 'connecting' | 'connected' | 'disconnected';

export function usePusherConnectionState(): RealtimeConnectionState {
  const configured = isPusherConfigured();
  const [state, setState] = useState<RealtimeConnectionState>(configured ? 'connecting' : 'unavailable');

  useEffect(() => {
    if (!configured) return;

    const client = getPusherClient();
    const updateState = (change: { current: string }) => {
      setState(change.current === 'connected' ? 'connected' : change.current === 'connecting' ? 'connecting' : 'disconnected');
    };

    client.connection.bind('state_change', updateState);
    return () => {
      client.connection.unbind('state_change', updateState);
    };
  }, [configured]);

  return state;
}
