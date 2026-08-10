'use strict';

const CACHE_PREFIX = 'pedidolocal-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline';
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
