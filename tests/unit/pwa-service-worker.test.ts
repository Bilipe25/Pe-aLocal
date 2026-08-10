import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: Record<string, unknown>) => void;

function loadServiceWorker() {
  const handlers = new Map<string, Handler>();
  const cache = { put: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        'pedidolocal-shell-v0',
        'pedidolocal-shell-v1',
        'cache-de-outra-aplicacao',
      ]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(new Response('offline')),
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response('ok', { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }),
    );
  const self = {
    location: { origin: 'https://pedidolocal.test' },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((type: string, handler: Handler) => handlers.set(type, handler)),
  };
  const source = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchMock,
    Request,
    Response,
    URL,
    Set,
    Promise,
    Error,
  });

  return { handlers, caches, cache, fetchMock, self };
}

describe('Service Worker PedidoLocal', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('não intercepta métodos mutáveis', () => {
    const { handlers } = loadServiceWorker();
    const respondWith = vi.fn();
    handlers.get('fetch')?.({
      request: { method: 'POST', url: 'https://pedidolocal.test/api/orders', mode: 'cors' },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it.each(['/api/store-assets/a', '/dashboard/orders', '/loja/cart', '/loja/checkout'])(
    'mantém %s em Network Only',
    async (pathname) => {
      const { handlers, fetchMock, caches } = loadServiceWorker();
      const respondWith = vi.fn();
      const request = {
        method: 'GET',
        url: `https://pedidolocal.test${pathname}`,
        mode: pathname.startsWith('/api/') ? 'cors' : 'navigate',
      };
      handlers.get('fetch')?.({ request, respondWith });

      expect(respondWith).toHaveBeenCalledOnce();
      await respondWith.mock.calls[0][0];
      expect(fetchMock).toHaveBeenCalledWith(request);
      expect(caches.match).not.toHaveBeenCalled();
    },
  );

  it('usa somente o fallback offline quando uma navegação pública falha', async () => {
    const { handlers, fetchMock, caches } = loadServiceWorker();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const respondWith = vi.fn();
    const request = {
      method: 'GET',
      url: 'https://pedidolocal.test/loja',
      mode: 'navigate',
    };
    handlers.get('fetch')?.({ request, respondWith });

    await expect(respondWith.mock.calls[0][0]).resolves.toBeInstanceOf(Response);
    expect(caches.match).toHaveBeenCalledWith('/offline');
  });

  it('recusa precache private/no-store', async () => {
    const { handlers, fetchMock, cache } = loadServiceWorker();
    fetchMock.mockResolvedValue(
      new Response('privado', { headers: { 'Cache-Control': 'private, no-store' } }),
    );
    const waitUntil = vi.fn();
    handlers.get('install')?.({ waitUntil });

    await expect(waitUntil.mock.calls[0][0]).rejects.toThrow('Precache recusado');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('remove apenas versões antigas do próprio prefixo', async () => {
    const { handlers, caches } = loadServiceWorker();
    const waitUntil = vi.fn();
    handlers.get('activate')?.({ waitUntil });
    await waitUntil.mock.calls[0][0];

    expect(caches.delete).toHaveBeenCalledOnce();
    expect(caches.delete).toHaveBeenCalledWith('pedidolocal-shell-v0');
  });
});
