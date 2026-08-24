import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupDevelopmentPwa,
  isPwaUpdateSafePath,
  registerProductionServiceWorker,
} from '@/components/pwa/service-worker-registration';

describe('registro do Service Worker', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    '/dashboard',
    '/admin/tenants',
    '/login',
    '/auth/callback',
    '/loja/cart',
    '/loja/checkout',
    '/loja/orders',
    '/loja/order/token',
    `/q/${'a'.repeat(43)}`,
    `/q/${'a'.repeat(43)}/cart`,
    `/q/s/${'S'.repeat(43)}`,
  ])('adia atualização na rota sensível %s', (pathname) => {
    expect(isPwaUpdateSafePath(pathname)).toBe(false);
  });

  it.each(['/', '/offline', '/offline.html', '/loja', '/sobre'])(
    'permite aviso na rota segura %s',
    (pathname) => {
      expect(isPwaUpdateSafePath(pathname)).toBe(true);
    },
  );

  it('registra na raiz sem cachear a atualização e anuncia worker waiting', async () => {
    const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const registration = {
      waiting,
      active: null,
      installing: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;
    const serviceWorker = {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
    const onWaiting = vi.fn();

    const cleanup = await registerProductionServiceWorker({
      onWaiting,
      onControllerChange: vi.fn(),
      onError: vi.fn(),
    });

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(onWaiting).toHaveBeenCalledWith(waiting);
    cleanup();
  });

  it('limpa em dev somente o SW e caches PedidoLocal', async () => {
    const unregisterOwn = vi.fn().mockResolvedValue(true);
    const unregisterOther = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([
          { active: { scriptURL: 'http://localhost/sw.js' }, unregister: unregisterOwn },
          { active: { scriptURL: 'http://localhost/other-sw.js' }, unregister: unregisterOther },
        ]),
      },
    });
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['pedidolocal-shell-v0', 'outra-app']),
        delete: deleteCache,
      },
    });

    await cleanupDevelopmentPwa();

    expect(unregisterOwn).toHaveBeenCalledOnce();
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('pedidolocal-shell-v0');
  });
});
