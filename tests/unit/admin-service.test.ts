import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeTenantStatus } from '@/server/services/admin.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  getDb: vi.fn(),
  getPlatformOverview: vi.fn(),
  getTenantSupportDetails: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({ requireSuperAdmin: mocks.requireSuperAdmin }));
vi.mock('@/server/repositories/admin.repository', () => ({
  getPlatformOverview: mocks.getPlatformOverview,
  getTenantSupportDetails: mocks.getTenantSupportDetails,
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
});
