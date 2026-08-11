'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, LoaderCircle, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { base64UrlToUint8Array, sha256Hex } from '@/lib/web-push/base64url';
import {
  applyMerchantBadge,
  MERCHANT_PUSH_ACTIVE_STORAGE_KEY,
} from '@/lib/web-push/merchant-badge';

type State =
  | 'unsupported'
  | 'permission-default'
  | 'permission-denied'
  | 'subscribing'
  | 'enabled'
  | 'disabling'
  | 'testing'
  | 'error'
  | 'blocked';

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function hashFor(subscription: PushSubscription) {
  return sha256Hex(subscription.endpoint);
}

function rememberMerchantPush(active: boolean) {
  try {
    if (active) window.localStorage?.setItem?.(MERCHANT_PUSH_ACTIVE_STORAGE_KEY, '1');
    else window.localStorage?.removeItem?.(MERCHANT_PUSH_ACTIVE_STORAGE_KEY);
  } catch {
    // O servidor continua sendo a fonte da verdade quando storage local estÃ¡ indisponÃ­vel.
  }
}

export function StorePushSubscription({
  publicVapidKey,
  reconcileKey,
}: {
  publicVapidKey: string;
  reconcileKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>('permission-default');
  const [message, setMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const reconcile = useCallback(async () => {
    if (!publicVapidKey || !supported()) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('permission-denied');
      return;
    }
    try {
      const subscription = await currentSubscription();
      if (!subscription) {
        setState('permission-default');
        return;
      }
      const hash = await hashFor(subscription);
      const response = await fetch(`/dashboard/api/push-subscription?endpointHash=${hash}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 404) {
        rememberMerchantPush(false);
        setState('blocked');
        return;
      }
      const data = (await response.json()) as { enabled?: boolean; badgeCount?: number };
      if (!response.ok) throw new Error('state');
      if (data.enabled) {
        rememberMerchantPush(true);
        setState('enabled');
      } else {
        if (!data.badgeCount) rememberMerchantPush(false);
        setState('permission-default');
      }
      await applyMerchantBadge(data.badgeCount ?? 0);
    } catch {
      setState('error');
      setMessage('NÃ£o foi possÃ­vel verificar os alertas agora.');
    }
  }, [publicVapidKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reconcile(), 0);
    return () => window.clearTimeout(timer);
  }, [reconcile, reconcileKey]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [reconcile]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  async function enable() {
    if (!supported()) return;
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'permission-denied' : 'permission-default');
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
      const response = await fetch('/dashboard/api/push-subscription', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error('enable');
      rememberMerchantPush(true);
      setState('enabled');
      await reconcile();
    } catch {
      setState('error');
      setMessage('NÃ£o foi possÃ­vel ativar os alertas. Tente novamente.');
    }
  }

  async function disable() {
    setState('disabling');
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const response = await fetch('/dashboard/api/push-subscription', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpointHash: await hashFor(subscription) }),
        });
        const data = (await response.json()) as { remaining?: number };
        if (!response.ok) throw new Error('disable');
        if (!data.remaining) {
          rememberMerchantPush(false);
          await applyMerchantBadge(0);
        }
      }
      await reconcile();
    } catch {
      setState('enabled');
      setMessage('NÃ£o foi possÃ­vel desativar os alertas agora.');
    }
  }

  async function test() {
    setState('testing');
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      if (!subscription) throw new Error('subscription');
      const response = await fetch('/dashboard/api/push-subscription/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointHash: await hashFor(subscription) }),
      });
      if (!response.ok) throw new Error('test');
      setState('enabled');
      setMessage('NotificaÃ§Ã£o de teste enviada para este dispositivo.');
    } catch {
      setState('enabled');
      setMessage('O teste nÃ£o pôde ser enviado. Verifique a permissÃ£o do navegador.');
    }
  }

  const busy = state === 'subscribing' || state === 'disabling' || state === 'testing';
  const active = state === 'enabled' || state === 'testing';

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls="merchant-push-panel"
        onClick={() => setOpen((current) => !current)}
      >
        {active ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
        <span>Alertas</span>
        <span className="text-text-secondary text-xs">{active ? 'Ativos' : 'Inativos'}</span>
      </Button>
      {open && (
        <section
          id="merchant-push-panel"
          aria-label="Alertas de novos pedidos"
          className="bg-surface border-border absolute top-full right-0 z-30 mt-2 w-80 rounded-xl border p-4 shadow-lg"
        >
          <h2 className="text-text-primary font-semibold">Alertas neste dispositivo</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Receba novos pedidos mesmo com a Central fechada. O som depende das configuraÃ§Ãµes do
            dispositivo.
          </p>
          {state === 'unsupported' && (
            <p className="text-warning mt-3 text-sm">Este navegador nÃ£o oferece Web Push.</p>
          )}
          {state === 'permission-denied' && (
            <p className="text-warning mt-3 text-sm">
              As notificaÃ§Ãµes estÃ£o bloqueadas. Libere-as nas configuraÃ§Ãµes do navegador.
            </p>
          )}
          {state === 'blocked' && (
            <p className="text-warning mt-3 text-sm">
              Os alertas operacionais estÃ£o desativados neste ambiente.
            </p>
          )}
          {message && (
            <p className="text-text-secondary mt-3 text-sm" role="status">
              {message}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!active &&
              state !== 'unsupported' &&
              state !== 'permission-denied' &&
              state !== 'blocked' && (
                <Button type="button" size="sm" disabled={busy} onClick={() => void enable()}>
                  {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  Ativar
                </Button>
              )}
            {active && (
              <>
                <Button type="button" size="sm" disabled={busy} onClick={() => void test()}>
                  {state === 'testing' ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send aria-hidden="true" />
                  )}
                  Testar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void disable()}
                >
                  Desativar
                </Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
