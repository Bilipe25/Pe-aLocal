'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, LoaderCircle } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { base64UrlToUint8Array, sha256Hex } from '@/lib/web-push/base64url';
import { MERCHANT_PUSH_ACTIVE_STORAGE_KEY } from '@/lib/web-push/merchant-badge';

type PushState =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'subscribing'
  | 'enabled'
  | 'disabling'
  | 'denied'
  | 'error';

function apiUrl(publicToken: string, storeSlug: string, endpointHash?: string) {
  const query = new URLSearchParams({ storeSlug });
  if (endpointHash) query.set('endpointHash', endpointHash);
  return `/api/orders/track/${encodeURIComponent(publicToken)}/push-subscription?${query}`;
}

function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function endpointHash(subscription: PushSubscription) {
  return sha256Hex(subscription.endpoint);
}

export function OrderPushSubscription({
  publicToken,
  storeSlug,
  publicVapidKey,
  status,
}: {
  publicToken: string;
  storeSlug: string;
  publicVapidKey?: string | null;
  status: OrderStatus;
}) {
  const [state, setState] = useState<PushState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const terminal = status === 'DELIVERED' || status === 'CANCELLED';

  const reconcile = useCallback(async () => {
    if (!publicVapidKey || !isSupported()) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    try {
      const subscription = await currentSubscription();
      if (!subscription) {
        setState('idle');
        return;
      }
      const hash = await endpointHash(subscription);
      const response = await fetch(apiUrl(publicToken, storeSlug, hash), {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const result = (await response.json()) as { enabled?: boolean };
      setState(response.ok && result.enabled ? 'enabled' : 'idle');
    } catch {
      setState('error');
      setMessage('Não foi possível verificar as notificações agora.');
    }
  }, [publicToken, publicVapidKey, storeSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reconcile(), 0);
    return () => window.clearTimeout(timer);
  }, [reconcile]);

  useEffect(() => {
    const merchantPushIsActive = () => {
      try {
        return window.localStorage?.getItem?.(MERCHANT_PUSH_ACTIVE_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    };
    const clearBadge = () => {
      if (document.visibilityState === 'visible' && !merchantPushIsActive()) {
        void navigator.clearAppBadge?.().catch(() => undefined);
      }
    };
    clearBadge();
    document.addEventListener('visibilitychange', clearBadge);
    window.addEventListener('focus', clearBadge);
    return () => {
      document.removeEventListener('visibilitychange', clearBadge);
      window.removeEventListener('focus', clearBadge);
    };
  }, []);

  async function enable() {
    if (!publicVapidKey || !isSupported()) return;
    setMessage(null);
    try {
      setState('requesting');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle');
        return;
      }
      setState('subscribing');
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicVapidKey),
        }));
      const response = await fetch(apiUrl(publicToken, storeSlug), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error('subscription');
      setState('enabled');
    } catch {
      setState('error');
      setMessage('Não foi possível ativar as notificações. Tente novamente.');
    }
  }

  async function disable() {
    setMessage(null);
    setState('disabling');
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const hash = await endpointHash(subscription);
        const response = await fetch(apiUrl(publicToken, storeSlug), {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpointHash: hash }),
        });
        if (!response.ok) throw new Error('disable');
      }
      setState('idle');
    } catch {
      setState('error');
      setMessage('Não foi possível desativar as notificações agora.');
    }
  }

  if (state === 'unsupported' || terminal) return null;

  const busy = state === 'requesting' || state === 'subscribing' || state === 'disabling';
  return (
    <div className="border-tinta/10 bg-papel mt-4 rounded-xl border p-3.5" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="bg-brand-50 text-brand-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          {state === 'enabled' ? (
            <Bell className="h-4.5 w-4.5" aria-hidden="true" />
          ) : (
            <BellOff className="h-4.5 w-4.5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-tinta text-sm font-bold">Atualizações deste pedido</p>
          <p className="text-text-secondary mt-0.5 text-xs leading-relaxed">
            {state === 'enabled'
              ? 'Você receberá avisos de confirmação, preparo, pedido pronto, entrega, conclusão ou cancelamento.'
              : state === 'denied'
                ? 'As notificações estão bloqueadas nas configurações do navegador.'
                : 'Receba avisos mesmo quando esta tela estiver fechada.'}
          </p>
          {message && (
            <p className="text-error mt-1.5 text-xs" role="status">
              {message}
            </p>
          )}
        </div>
        {state !== 'denied' && (
          <Button
            type="button"
            size="sm"
            variant={state === 'enabled' ? 'outline' : 'default'}
            disabled={busy}
            onClick={() => void (state === 'enabled' ? disable() : enable())}
            className="h-8 shrink-0 px-3 text-xs"
          >
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {state === 'enabled' ? 'Desativar' : busy ? 'Aguarde…' : 'Ativar'}
          </Button>
        )}
      </div>
    </div>
  );
}
