import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changeTenantStatus,
  getAdminStoreContext,
  getAdminTenantsData,
} from '@/server/services/admin.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireSuperAdminStoreAccess: vi.fn(),
  getDb: vi.fn(),
  getPlatformOverview: vi.fn(),
  getTenantSupportDetails: vi.fn(),
  listTenantsForAdmin: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/repositories/admin.repository', () => ({
  getPlatformOverview: mocks.getPlatformOverview,
  getTenantSupportDetails: mocks.getTenantSupportDetails,
  listTenantsForAdmin: mocks.listTenantsForAdmin,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

describe('AdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({ userId: 'admin-1' });
    mocks.tenantFindUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Tenant',
      status: 'ACTIVE',
    });
    mocks.tenantUpdate.mockResolvedValue({
      id: 'tenant-1',
      name: 'Tenant',
      status: 'SUSPENDED',
    });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });

    const transactionClient = {
      tenant: { findUnique: mocks.tenantFindUnique, update: mocks.tenantUpdate },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });
  });

  it('gera auditoria na mesma transação ao suspender tenant', async () => {
    await expect(changeTenantStatus('tenant-1', 'SUSPENDED')).resolves.toMatchObject({
      status: 'SUSPENDED',
    });

    expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce();
    expect(mocks.tenantUpdate).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: { status: 'SUSPENDED' },
      select: { id: true, name: true, status: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'admin-1',
        action: 'TENANT_SUSPENDED',
        entity: 'Tenant',
        entityId: 'tenant-1',
        metadata: { previousStatus: 'ACTIVE', nextStatus: 'SUSPENDED' },
      }),
    });
  });

  it('protege a listagem dedicada de tenants', async () => {
    const data = { total: 1, tenants: [{ id: 'tenant-1' }] };
    mocks.listTenantsForAdmin.mockResolvedValue(data);

    await expect(getAdminTenantsData()).resolves.toEqual(data);
    expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce();
  });

  it('obtém a loja pelo contexto administrativo validado', async () => {
    const store = { id: 'store-1', tenantId: 'tenant-1', name: 'Loja' };
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({ store });

    await expect(getAdminStoreContext('tenant-1', 'store-1')).resolves.toEqual(store);
    expect(mocks.requireSuperAdminStoreAccess).toHaveBeenCalledWith('tenant-1', 'store-1');
  });
});
