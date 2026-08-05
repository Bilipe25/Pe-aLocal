'use client';

import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

const ONLINE_HIDE_DELAY_MS = 2_000;

export function NetworkStatus() {
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnecting'>(() => {
    if (typeof navigator === 'undefined') return 'online';
    return navigator.onLine ? 'online' : 'offline';
  });

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setStatus('reconnecting');
      hideTimeout = setTimeout(() => {
        setStatus('online');
      }, ONLINE_HIDE_DELAY_MS);
    };

    const handleOffline = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, []);

  if (status === 'online') return null;

  const isReconnecting = status === 'reconnecting';
  const Icon = isReconnecting ? Wifi : WifiOff;
  const label = isReconnecting ? 'Conexão restabelecida' : 'Sem internet';
  const message = isReconnecting
    ? 'Você está online novamente.'
    : 'Verifique sua conexão para garantir que os dados estejam atualizados.';

  return (
    <div
      className={`storefront-network-status ${isReconnecting ? 'is-reconnecting' : 'is-offline'}`}
      role="status"
      aria-live="polite"
    >
      <div className="storefront-network-status-inner">
        <span className="storefront-network-status-icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="storefront-network-status-copy">
          <strong className="storefront-network-status-title">{label}</strong>
          <p className="storefront-network-status-message">{message}</p>
        </div>
      </div>
    </div>
  );
}
