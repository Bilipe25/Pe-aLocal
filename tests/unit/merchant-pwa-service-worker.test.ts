import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const registration = { showNotification: vi.fn().mockResolvedValue(undefined) };
  const workerNavigator = {
    setAppBadge: vi.fn().mockResolvedValue(undefined),
    clearAppBadge: vi.fn().mockResolvedValue(undefined),
  };
  const self = {
    location: { origin: 'https://pedidolocal.test' },
    registration,
    navigator: workerNavigator,
    clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (event: Record<string, unknown>) => void) =>
      handlers.set(type, handler),
    ),
  };
  vm.runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
    self,
    caches: { open: vi.fn(), keys: vi.fn(), delete: vi.fn(), match: vi.fn() },
    fetch: vi.fn(),
    Request,
    Response,
    URL,
    Set,
    Promise,
    Error,
  });
  return { handlers, registration, workerNavigator };
}

describe('Merchant Push no Service Worker', () => {
  it('aplica alerta persistente e badge agregado', async () => {
    const { handlers, registration, workerNavigator } = worker();
    const waitUntil = vi.fn();
    handlers.get('push')?.({
      data: {
        json: () => ({
          notification: {
            title: 'Novo pedido #184',
            body: 'R$ 67,90 â€¢ Entrega â€¢ 4 itens',
            tag: 'merchant-order-hash',
            renotify: true,
            requireInteraction: true,
            actions: [{ action: 'open-order', title: 'Abrir pedido' }],
          },
          pedidolocal: {
            schemaVersion: 1,
            audience: 'merchant',
            type: 'new-order',
            relativeUrl:
              '/dashboard/orders/open?store=00000000-0000-4000-8000-000000000001&order=00000000-0000-4000-8000-000000000002',
            pendingActionableCount: 2,
          },
        }),
      },
      waitUntil,
    });
    await waitUntil.mock.calls[0][0];
    expect(registration.showNotification).toHaveBeenCalledWith(
      'Novo pedido #184',
      expect.objectContaining({ renotify: true, requireInteraction: true }),
    );
    expect(workerNavigator.setAppBadge).toHaveBeenCalledWith(2);
  });

  it('preserva badge administrativo em Push consumidor', async () => {
    const { handlers, workerNavigator } = worker();
    const waitUntil = vi.fn();
    handlers.get('push')?.({
      data: {
        json: () => ({
          notification: { title: 'Loja', body: 'Pedido confirmado', tag: 'tag' },
          pedidolocal: {
            schemaVersion: 1,
            audience: 'consumer',
            badgeMode: 'preserve',
            relativeUrl: '/loja/order/00000000-0000-4000-8000-000000000001',
          },
        }),
      },
      waitUntil,
    });
    await waitUntil.mock.calls[0][0];
    expect(workerNavigator.setAppBadge).not.toHaveBeenCalled();
    expect(workerNavigator.clearAppBadge).not.toHaveBeenCalled();
  });
});
