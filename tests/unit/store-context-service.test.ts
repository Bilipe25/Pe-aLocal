import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantAccessError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  ACTIVE_STORE_COOKIE,
  getActiveStoreContext,
  rememberActiveStore,
} from '@/server/services/store-context.service';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  requirePermission: vi.fn(),
  requireTenantStoreAccess: vi.fn(),
  findStoreScopeById: vi.fn(),
  listStoreSummariesByTenantId: vi.fn(),
  countStoresByTenantId: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));
vi.mock('@/server/auth', () => ({
  requirePermission: mocks.requirePermission,
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreScopeById: mocks.findStoreScopeById,
  listStoreSummariesByTenantId: mocks.listStoreSummariesByTenantId,
  countStoresByTenantId: mocks.countStoresByTenantId,
}));

const storeAId = '00000000-0000-4000-8000-000000000001';
const storeBId = '00000000-0000-4000-8000-000000000002';
const session = {
  userId: 'user-1',
  authUserId: 'auth-1',
  email: 'owner@example.test',
  name: 'Owner',
  platformRole: 'USER',
  tenantRole: 'OWNER',
  tenantId: 'tenant-a',
  storeId: null,
};
const storeA = {
  id: storeAId,
  tenantId: 'tenant-a',
  name: 'Loja A',
  slug: 'loja-a',
  status: 'OPEN',
  isActive: true,
  tenant: { id: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' },
};

describe('contexto ativo de loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(session);
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.listStoreSummariesByTenantId.mockResolvedValue([]);
  });

  it('aceita o cookie somente depois de validar loja e tenant no servidor', async () => {
    mocks.cookieGet.mockReturnValue({ value: storeAId });
    mocks.findStoreScopeById.mockResolvedValue(storeA);

    await expect(getActiveStoreContext()).resolves.toEqual({ session, store: storeA });
    expect(mocks.requirePermission).toHaveBeenCalledWith(Permission.VIEW_STORE_OVERVIEW);
    expect(mocks.findStoreScopeById).toHaveBeenCalledWith(storeAId, 'tenant-a');
  });

  it('ignora cookie manipulado e exige seleção quando há várias lojas', async () => {
    mocks.cookieGet.mockReturnValue({ value: storeBId });
    mocks.findStoreScopeById.mockResolvedValue(null);
    mocks.listStoreSummariesByTenantId.mockResolvedValue([{ id: storeAId }, { id: storeBId }]);

    await expect(getActiveStoreContext()).resolves.toBeNull();
    expect(mocks.findStoreScopeById).toHaveBeenCalledWith(storeBId, 'tenant-a');
  });

  it('resolve automaticamente somente quando o tenant possui uma única loja', async () => {
    mocks.listStoreSummariesByTenantId.mockResolvedValue([{ id: storeAId }]);
    mocks.findStoreScopeById.mockResolvedValue(storeA);

    await expect(getActiveStoreContext()).resolves.toEqual({ session, store: storeA });
  });

  it('valida a seleção antes de persistir cookie HttpOnly', async () => {
    mocks.requireTenantStoreAccess.mockResolvedValue({ session, store: storeA });

    await expect(rememberActiveStore(storeAId)).resolves.toEqual({ session, store: storeA });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(storeAId);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      ACTIVE_STORE_COOKIE,
      storeAId,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/dashboard' }),
    );
  });

  it('rejeita identificador inválido sem consultar autorização', async () => {
    await expect(rememberActiveStore('store-a')).rejects.toBeInstanceOf(TenantAccessError);
    expect(mocks.requireTenantStoreAccess).not.toHaveBeenCalled();
  });
});
