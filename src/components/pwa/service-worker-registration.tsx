'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';

const SERVICE_WORKER_URL = '/sw.js';
const CACHE_PREFIX = 'pedidolocal-shell-';
const UPDATE_TOAST_ID = 'pedidolocal-pwa-update';

export function isPwaUpdateSafePath(pathname: string): boolean {
  if (/^\/(?:dashboard|admin|auth)(?:\/|$)/.test(pathname)) return false;
  if (/^\/(?:login|forgot-password|reset-password)(?:\/|$)/.test(pathname)) return false;
  return !/^\/[^/]+\/(?:cart|checkout|orders|order)(?:\/|$)/.test(pathname);
}

export async function cleanupDevelopmentPwa(): Promise<void> {
  const registrations = await navigator.serviceWorker?.getRegistrations?.();
  await Promise.all(
    (registrations ?? [])
      .filter((registration) => {
        const scriptUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL;
        return scriptUrl ? new URL(scriptUrl).pathname === SERVICE_WORKER_URL : false;
      })
      .map((registration) => registration.unregister()),
  );

  if ('caches' in window) {
    const keys = await window.caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => window.caches.delete(key)),
    );
  }
}

interface RegistrationCallbacks {
  onWaiting: (worker: ServiceWorker) => void;
  onControllerChange: () => void;
  onError: (errorName: string) => void;
}

export async function registerProductionServiceWorker({
  onWaiting,
  onControllerChange,
  onError,
}: RegistrationCallbacks): Promise<() => void> {
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    });

    const reportWaiting = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        onWaiting(registration.waiting);
      }
    };
    const handleUpdateFound = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', reportWaiting);
    };

    registration.addEventListener('updatefound', handleUpdateFound);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    reportWaiting();

    return () => {
      registration.removeEventListener('updatefound', handleUpdateFound);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  } catch (error) {
    onError(error instanceof DOMException ? error.name : 'UnknownError');
    return () => undefined;
  }
}

export function ServiceWorkerRegistration() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const reloadRequestedRef = useRef(false);

  const offerUpdate = () => {
    if (!waitingWorkerRef.current || !isPwaUpdateSafePath(pathnameRef.current)) return;

    toast('Uma nova versão está disponível', {
      id: UPDATE_TOAST_ID,
      duration: Infinity,
      action: {
        label: 'Atualizar',
        onClick: () => {
          reloadRequestedRef.current = true;
          waitingWorkerRef.current?.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    });
  };

  useEffect(() => {
    pathnameRef.current = pathname;
    if (isPwaUpdateSafePath(pathname)) offerUpdate();
    else toast.dismiss(UPDATE_TOAST_ID);
  }, [pathname]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'development') {
      if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
        void cleanupDevelopmentPwa();
      }
      return;
    }

    let unregisterListeners: () => void = () => undefined;
    let cancelled = false;
    const register = () => {
      void registerProductionServiceWorker({
        onWaiting(worker) {
          if (cancelled) return;
          waitingWorkerRef.current = worker;
          offerUpdate();
        },
        onControllerChange() {
          if (!reloadRequestedRef.current) return;
          reloadRequestedRef.current = false;
          window.location.reload();
        },
        onError(errorName) {
          console.warn(`[PWA] Registro indisponível (${errorName}).`);
        },
      }).then((cleanup) => {
        if (cancelled) cleanup();
        else unregisterListeners = cleanup;
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', register);
      unregisterListeners();
    };
  }, []);

  return null;
}
