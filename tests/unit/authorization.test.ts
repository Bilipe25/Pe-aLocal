import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError, TenantAccessError } from '@/server/errors';
import {
  requireStoreAccess,
  requireSuperAdmin,
  requireSuperAdminStoreAccess,
  requireTenantStoreAccess,
} from '@/server/auth';

const mocks = vi.hoisted(() => ({
  validateCurrentSession: vi.fn(),
  findStoreScopeById: vi.fn(),
}));

vi.mock('@/server/services/auth.service', () => ({
  validateCurrentSession: mocks.validateCurrentSession,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreScopeById: mocks.findStoreScopeById,
}));

const baseSession = {
  userId: 'user-1',
  authUserId: 'auth-1',
  email: 'user@demo.com',
  name: 'User',
  platformRole: 'USER',
  tenantRole: 'OWNER',
  tenantId: 'tenant-a',
  storeId: 'store-a',
};

describe('autorização de plataforma e isolamento de tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateCurrentSession.mockResolvedValue(baseSession);
  });

  it('permite SUPER_ADMIN acessar a área administrativa sem tenant', async () => {
    const superAdmin = {
      ...baseSession,
      platformRole: 'SUPER_ADMIN',
      tenantRole: null,
      tenantId: null,
      storeId: null,
    };
    mocks.validateCurrentSession.mockResolvedValue(superAdmin);

    await expect(requireSuperAdmin()).resolves.toEqual(superAdmin);
  });

  it('nega /admin a OWNER', async () => {
    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it.each(['MANAGER', 'ATTENDANT'] as const)('nega /admin a %s', async (tenantRole) => {
    mocks.validateCurrentSession.mockResolvedValue({ ...baseSession, tenantRole });

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('usuário sem membership não vira administrador', async () => {
    mocks.validateCurrentSession.mockResolvedValue({
      ...baseSession,
      tenantRole: null,
      tenantId: null,
      storeId: null,
    });

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('tenant A não acessa recurso do tenant B', async () => {
    mocks.findStoreScopeById.mockResolvedValue(null);

    await expect(requireStoreAccess('store-from-tenant-b')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
    expect(mocks.findStoreScopeById).toHaveBeenCalledWith('store-from-tenant-b', 'tenant-a');
  });

  it('valida a loja explícita contra o tenant autenticado', async () => {
    mocks.findStoreScopeById.mockResolvedValue(null);

    await expect(requireTenantStoreAccess('store-from-tenant-b')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
    expect(mocks.findStoreScopeById).toHaveBeenCalledWith('store-from-tenant-b', 'tenant-a');
  });

  it('SUPER_ADMIN acessa uma loja sem depender de tenant na sessão', async () => {
    const superAdmin = {
      ...baseSession,
      email: 'platform-admin@example.test',
      platformRole: 'SUPER_ADMIN',
      tenantRole: null,
      tenantId: null,
      storeId: null,
    };
    const store = {
      id: 'store-a',
      tenantId: 'tenant-a',
      name: 'Loja A',
      slug: 'loja-a',
      status: 'ACTIVE',
      isActive: true,
      tenant: { id: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' },
    };
    mocks.validateCurrentSession.mockResolvedValue(superAdmin);
    mocks.findStoreScopeById.mockResolvedValue(store);

    await expect(requireSuperAdminStoreAccess('tenant-a', 'store-a')).resolves.toEqual({
      session: superAdmin,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      store,
    });
    expect(mocks.findStoreScopeById).toHaveBeenCalledWith('store-a', 'tenant-a');
  });

  it('não aceita uma loja associada a outro tenant na área de plataforma', async () => {
    mocks.validateCurrentSession.mockResolvedValue({
      ...baseSession,
      platformRole: 'SUPER_ADMIN',
      tenantRole: null,
      tenantId: null,
      storeId: null,
    });
    mocks.findStoreScopeById.mockResolvedValue(null);

    await expect(
      requireSuperAdminStoreAccess('tenant-a', 'store-from-tenant-b'),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('nega OWNER antes de consultar o escopo da loja administrativa', async () => {
    await expect(requireSuperAdminStoreAccess('tenant-a', 'store-a')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mocks.findStoreScopeById).not.toHaveBeenCalled();
  });
});
