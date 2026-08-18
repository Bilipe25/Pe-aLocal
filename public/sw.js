'use strict';

const CACHE_PREFIX = 'pedidolocal-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/pwa/pedidolocal-icon-v1-192.png',
  '/pwa/pedidolocal-icon-v1-512.png',
  '/pwa/pedidolocal-maskable-v1-512.png',
  '/pwa/apple-touch-icon-v1-180.png',
];
const PRECACHE_PATHS = new Set(PRECACHE_URLS);

function isSensitiveNavigation(pathname) {
  if (/^\/(?:dashboard|admin|auth)(?:\/|$)/.test(pathname)) return true;
  if (/^\/(?:login|forgot-password|reset-password)(?:\/|$)/.test(pathname)) return true;
  return /^\/[^/]+\/(?:cart|checkout|orders|order)(?:\/|$)/.test(pathname);
}

function canCacheResponse(response) {
  if (!response || !response.ok) return false;
  const cacheControl = response.headers.get('cache-control') || '';
  return !/(?:^|,)\s*(?:private|no-store)(?:\s|,|=|$)/i.test(cacheControl);
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);

  for (const url of PRECACHE_URLS) {
    const request = new Request(new URL(url, self.location.origin), {
      credentials: 'omit',
      cache: 'reload',
    });
    const response = await fetch(request);
    if (!canCacheResponse(response)) throw new Error(`Precache recusado: ${url}`);
    await cache.put(request, response);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

function validTrackingPath(pathname) {
  return /^\/[^/]+\/order\/[0-9a-f-]{36}$/.test(pathname);
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || '',
  );
}

function validMerchantTarget(target, type) {
  if (type === 'test') return target.pathname === '/dashboard/orders' && !target.search;
  if (type !== 'new-order' || target.pathname !== '/dashboard/orders/open') return false;
  return (
    validUuid(target.searchParams.get('store')) &&
    validUuid(target.searchParams.get('order')) &&
    [...target.searchParams.keys()].every((key) => key === 'store' || key === 'order')
  );
}

function readPushPayload(event) {
  if (!event.data) return null;
  try {
    const payload = event.data.json();
    const notification = payload?.notification;
    const privateData = payload?.pedidolocal;
    if (
      !notification ||
      typeof notification.title !== 'string' ||
      typeof notification.body !== 'string' ||
      !privateData ||
      privateData.schemaVersion !== 1 ||
      typeof privateData.relativeUrl !== 'string'
    ) {
      return null;
    }
    const target = new URL(privateData.relativeUrl, self.location.origin);
    const audience = privateData.audience || 'consumer';
    const validTarget =
      audience === 'merchant'
        ? validMerchantTarget(target, privateData.type)
        : audience === 'consumer' && validTrackingPath(target.pathname);
    if (target.origin !== self.location.origin || !validTarget) return null;
    return { notification, privateData, target, audience };
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const parsed = readPushPayload(event);
  const title = parsed?.notification.title || 'PedidoLocal';
  const options = parsed
    ? {
        body: parsed.notification.body,
        icon: parsed.notification.icon || '/pwa/pedidolocal-icon-v1-192.png',
        badge: '/pwa/pedidolocal-icon-v1-192.png',
        tag: parsed.notification.tag,
        renotify: Boolean(parsed.notification.renotify),
        requireInteraction: Boolean(parsed.notification.requireInteraction),
        actions: Array.isArray(parsed.notification.actions)
          ? parsed.notification.actions.slice(0, 2)
          : undefined,
        lang: 'pt-BR',
        dir: 'ltr',
        data: {
          relativeUrl: parsed.privateData.relativeUrl,
          audience: parsed.audience,
          type: parsed.privateData.type,
          reminderStage: parsed.privateData.reminderStage,
          badgeMode: parsed.privateData.badgeMode,
        },
      }
    : {
        body: 'Há uma nova atualização do seu pedido.',
        icon: '/pwa/pedidolocal-icon-v1-192.png',
        badge: '/pwa/pedidolocal-icon-v1-192.png',
        tag: 'pedidolocal-order-update',
        data: { relativeUrl: '/' },
      };

  const badgePromise = (() => {
    if (!parsed) return Promise.resolve();
    if (parsed.audience === 'merchant') {
      const count = Number(parsed.privateData.pendingActionableCount);
      if (!Number.isSafeInteger(count) || count < 0) return Promise.resolve();
      return count === 0 && typeof self.navigator.clearAppBadge === 'function'
        ? self.navigator.clearAppBadge().catch(() => undefined)
        : typeof self.navigator.setAppBadge === 'function'
          ? self.navigator.setAppBadge(count).catch(() => undefined)
          : Promise.resolve();
    }
    if (parsed.privateData.badgeMode === 'preserve') return Promise.resolve();
    return typeof self.navigator?.setAppBadge === 'function'
      ? self.navigator.setAppBadge(1).catch(() => undefined)
      : Promise.resolve();
  })();

  event.waitUntil(Promise.all([self.registration.showNotification(title, options), badgePromise]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const audience = event.notification.data?.audience;
      if (
        audience === 'merchant' &&
        event.notification.data?.type === 'new-order' &&
        !event.notification.data?.reminderStage &&
        typeof self.navigator?.clearAppBadge === 'function'
      ) {
        await self.navigator.clearAppBadge().catch(() => undefined);
      }
      const relativeUrl = event.notification.data?.relativeUrl;
      const target = new URL(
        typeof relativeUrl === 'string' ? relativeUrl : '/',
        self.location.origin,
      );
      const validTarget =
        audience === 'merchant'
          ? validMerchantTarget(
              target,
              target.pathname === '/dashboard/orders/open' ? 'new-order' : 'test',
            )
          : target.pathname === '/' || validTrackingPath(target.pathname);
      if (target.origin !== self.location.origin || !validTarget) return;

      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const exact = windows.find((client) => client.url === target.href);
      if (exact) return exact.focus();
      const existing =
        audience === 'merchant'
          ? windows.find((client) => new URL(client.url).pathname.startsWith('/dashboard'))
          : windows[0];
      if (existing && 'navigate' in existing) {
        await existing.navigate(target.href);
        return existing.focus();
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    if (isSensitiveNavigation(url.pathname)) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
