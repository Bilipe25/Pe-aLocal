'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Bell, BellOff, LoaderCircle, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { base64UrlToUint8Array, sha256Hex } from '@/lib/web-push/base64url';
import {
  applyMerchantBadge,
  MERCHANT_PUSH_ACTIVE_STORAGE_KEY,
} from '@/lib/web-push/merchant-badge';
import { cn } from '@/lib/utils';

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

interface StorePushSubscriptionController {
  state: State;
  message: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  test: () => Promise<void>;
}

const StorePushSubscriptionContext = createContext<StorePushSubscriptionController | null>(null);
export const MERCHANT_PUSH_RECONCILE_EVENT = 'pedidolocal:merchant-push-reconcile';

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
    // O servidor continua sendo a fonte da verdade quando storage local está indisponível.
  }
}

async function responseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: unknown };
    return typeof data.message === 'string' && data.message.trim() ? data.message : fallback;
  } catch {
    return fallback;
  }
}

export function requestMerchantPushReconciliation() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MERCHANT_PUSH_RECONCILE_EVENT));
}

export function StorePushSubscriptionProvider({
  publicVapidKey,
  children,
}: {
  publicVapidKey: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>('permission-default');
  const [message, setMessage] = useState<string | null>(null);
  const operationInProgressRef = useRef(false);
  const reconcileGenerationRef = useRef(0);
  const reconcileInFlightRef = useRef<Promise<void> | null>(null);

  const reconcile = useCallback(() => {
    if (operationInProgressRef.current) return Promise.resolve();
    if (reconcileInFlightRef.current) return reconcileInFlightRef.current;

    const generation = ++reconcileGenerationRef.current;
    const isCurrent = () =>
      generation === reconcileGenerationRef.current && !operationInProgressRef.current;
    const task = (async () => {
      if (!publicVapidKey || !supported()) {
        if (isCurrent()) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (isCurrent()) setState('permission-denied');
        return;
      }
      try {
        const subscription = await currentSubscription();
        if (!isCurrent()) return;
        if (!subscription) {
          setState('permission-default');
          return;
        }
        const hash = await hashFor(subscription);
        const response = await fetch(`/dashboard/api/push-subscription?endpointHash=${hash}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!isCurrent()) return;
        if (response.status === 404) {
          rememberMerchantPush(false);
          setState('blocked');
          return;
        }
        if (!response.ok) {
          throw new Error(
            await responseError(response, 'Não foi possível verificar os alertas agora.'),
          );
        }
        const data = (await response.json()) as { enabled?: boolean; badgeCount?: number };
        if (!isCurrent()) return;
        if (data.enabled) {
          rememberMerchantPush(true);
          setState('enabled');
        } else {
          if (!data.badgeCount) rememberMerchantPush(false);
          setState('permission-default');
        }
        setMessage(null);
        await applyMerchantBadge(data.badgeCount ?? 0);
      } catch (error) {
        if (!isCurrent()) return;
        setState('error');
        setMessage(
          error instanceof Error ? error.message : 'Não foi possível verificar os alertas agora.',
        );
      }
    })();
    const trackedTask = task.finally(() => {
      if (reconcileInFlightRef.current === trackedTask) {
        reconcileInFlightRef.current = null;
      }
    });
    reconcileInFlightRef.current = trackedTask;
    return trackedTask;
  }, [publicVapidKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reconcile(), 0);
    return () => window.clearTimeout(timer);
  }, [reconcile]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener(MERCHANT_PUSH_RECONCILE_EVENT, refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(MERCHANT_PUSH_RECONCILE_EVENT, refresh);
    };
  }, [reconcile]);

  const enable = useCallback(async () => {
    if (!supported()) return;
    operationInProgressRef.current = true;
    reconcileGenerationRef.current += 1;
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
      if (!response.ok) {
        throw new Error(await responseError(response, 'Não foi possível ativar os alertas.'));
      }
      rememberMerchantPush(true);
      setState('enabled');
      setMessage('Alertas ativados com sucesso neste dispositivo.');
    } catch (error) {
      setState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível ativar os alertas. Tente novamente.',
      );
    } finally {
      operationInProgressRef.current = false;
    }
  }, [publicVapidKey]);

  const disable = useCallback(async () => {
    operationInProgressRef.current = true;
    reconcileGenerationRef.current += 1;
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
        if (!response.ok) {
          throw new Error(await responseError(response, 'Não foi possível desativar os alertas.'));
        }
        const data = (await response.json()) as { remaining?: number };
        if (!data.remaining) {
          rememberMerchantPush(false);
          await applyMerchantBadge(0);
        }
      }
      setState('permission-default');
      setMessage('Alertas desativados para esta loja.');
    } catch (error) {
      setState('enabled');
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível desativar os alertas agora.',
      );
    } finally {
      operationInProgressRef.current = false;
    }
  }, []);

  const test = useCallback(async () => {
    operationInProgressRef.current = true;
    reconcileGenerationRef.current += 1;
    setState('testing');
    setMessage(null);
    try {
      const subscription = await currentSubscription();
      if (!subscription) throw new Error('Ative os alertas antes de realizar o teste.');
      const response = await fetch('/dashboard/api/push-subscription/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointHash: await hashFor(subscription) }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'O teste não pôde ser enviado.'));
      }
      setState('enabled');
      setMessage('Notificação de teste enviada para este dispositivo.');
    } catch (error) {
      setState('enabled');
      setMessage(
        error instanceof Error
          ? error.message
          : 'O teste não pôde ser enviado. Verifique a permissão do navegador.',
      );
    } finally {
      operationInProgressRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({ state, message, enable, disable, test }),
    [disable, enable, message, state, test],
  );

  return (
    <StorePushSubscriptionContext.Provider value={value}>
      {children}
    </StorePushSubscriptionContext.Provider>
  );
}

export function StorePushSubscription({
  storeName,
  surface = 'sidebar',
}: {
  storeName: string;
  surface?: 'sidebar' | 'mobile-menu';
}) {
  const controller = useContext(StorePushSubscriptionContext);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!controller) return null;

  const { state, message, enable, disable, test } = controller;
  const busy = state === 'subscribing' || state === 'disabling' || state === 'testing';
  const active = state === 'enabled' || state === 'testing';
  const panelId = `merchant-push-panel-${surface}`;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant={surface === 'sidebar' ? 'ghost' : 'outline'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'h-auto min-h-11 w-full justify-start gap-3 rounded-md px-3 py-2 text-left',
          surface === 'sidebar' &&
            'focus-visible:ring-offset-tinta text-white hover:bg-white/[0.055] hover:text-white focus-visible:ring-white/80',
        )}
      >
        <span
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            active
              ? surface === 'sidebar'
                ? 'text-white'
                : 'bg-success-light text-success'
              : surface === 'sidebar'
                ? 'text-white/70'
                : 'bg-surface-secondary text-text-secondary',
          )}
        >
          {active ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />}
          {active && surface === 'sidebar' && (
            <span className="bg-success ring-tinta absolute top-0 right-0 h-2 w-2 rounded-full ring-2" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Alertas de pedidos</span>
          <span
            className={cn(
              'block truncate text-xs',
              surface === 'sidebar' ? 'text-white/60' : 'text-text-muted',
            )}
          >
            {active ? 'Ativos neste dispositivo' : 'Inativos neste dispositivo'}
          </span>
        </span>
      </Button>

      {open && (
        <section
          id={panelId}
          aria-label={`Alertas de novos pedidos — ${storeName}`}
          className={cn(
            'border-border bg-surface text-text-primary z-40 w-full rounded-xl border p-4 text-left shadow-md',
            surface === 'sidebar' && 'absolute bottom-[calc(100%+0.5rem)] left-0 w-80',
            surface === 'mobile-menu' && 'mt-2',
          )}
        >
          <h2 className="font-semibold">Alertas de novos pedidos</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Loja: <strong className="text-text-primary font-semibold">{storeName}</strong>
          </p>
          <p className="text-text-secondary mt-2 text-sm">
            Receba novos pedidos mesmo em outra página ou com o painel fechado. O som depende das
            configurações do dispositivo.
          </p>
          {state === 'unsupported' && (
            <p className="text-warning mt-3 text-sm">Este navegador não oferece Web Push.</p>
          )}
          {state === 'permission-denied' && (
            <p className="text-warning mt-3 text-sm">
              As notificações estão bloqueadas. Libere-as nas configurações do navegador.
            </p>
          )}
          {state === 'blocked' && (
            <p className="text-warning mt-3 text-sm">
              Os alertas operacionais estão desativados neste ambiente.
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
                  Ativar para esta loja
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
                  Desativar nesta loja
                </Button>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
