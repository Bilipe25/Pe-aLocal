import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError } from '@/server/errors';

const mocks = vi.hoisted(() => ({
  requireTenantStoreAccess: vi.fn(),
  findOrder: vi.fn(),
  rememberActiveStore: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({ order: { findFirst: mocks.findOrder } }),
}));
vi.mock('@/server/services/store-context.service', () => ({
  rememberActiveStore: mocks.rememberActiveStore,
}));

import { GET } from '@/app/(dashboard)/dashboard/orders/open/route';

const storeId = '00000000-0000-4000-8000-000000000001';
const orderId = '00000000-0000-4000-8000-000000000002';

describe('deep link de pedido operacional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantStoreAccess.mockResolvedValue({
      session: { tenantId: 'tenant-1', tenantRole: 'OWNER' },
      store: { id: storeId },
    });
    mocks.findOrder.mockResolvedValue({ id: orderId });
    mocks.rememberActiveStore.mockResolvedValue(undefined);
  });

  it('valida escopo, seleciona a loja e abre somente o pedido permitido', async () => {
    const response = await GET(
      new Request(
        `https://pedidolocal.test/dashboard/orders/open?store=${storeId}&order=${orderId}`,
      ),
    );
    expect(mocks.findOrder).toHaveBeenCalledWith({
      where: { id: orderId, tenantId: 'tenant-1', storeId },
      select: { id: true },
    });
    expect(mocks.rememberActiveStore).toHaveBeenCalledWith(storeId);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `https://pedidolocal.test/dashboard/orders?order=${orderId}`,
    );
  });

  it('nÃ£o troca a loja quando o pedido nÃ£o pertence ao escopo', async () => {
    mocks.findOrder.mockResolvedValue(null);
    const response = await GET(
      new Request(
        `https://pedidolocal.test/dashboard/orders/open?store=${storeId}&order=${orderId}`,
      ),
    );
    expect(response.status).toBe(404);
    expect(mocks.rememberActiveStore).not.toHaveBeenCalled();
  });

  it('preserva o destino completo ao pedir autenticaÃ§Ã£o', async () => {
    mocks.requireTenantStoreAccess.mockRejectedValue(new AuthenticationError());

    const response = await GET(
      new Request(
        `https://pedidolocal.test/dashboard/orders/open?store=${storeId}&order=${orderId}`,
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `https://pedidolocal.test/login?redirect=${encodeURIComponent(`/dashboard/orders/open?store=${storeId}&order=${orderId}`)}`,
    );
  });
});
