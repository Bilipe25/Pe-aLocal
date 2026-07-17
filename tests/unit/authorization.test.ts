import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError, TenantAccessError } from '@/server/errors';
import { requireStoreAccess, requireSuperAdmin } from '@/server/auth';

const mocks = vi.hoisted(() => ({
  validateCurrentSession: vi.fn(),
  findStoreById: vi.fn(),
}));

vi.mock('@/server/services/auth.service', () => ({
  validateCurrentSession: mocks.validateCurrentSession,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreById: mocks.findStoreById,
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
    mocks.findStoreById.mockResolvedValue(null);

    await expect(requireStoreAccess('store-from-tenant-b')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
    expect(mocks.findStoreById).toHaveBeenCalledWith('store-from-tenant-b', 'tenant-a');
  });
});
