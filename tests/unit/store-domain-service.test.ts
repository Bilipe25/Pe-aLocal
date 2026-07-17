import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@/server/errors';
import {
  changeStoreDomainStatus,
  requestStoreDomain,
} from '@/server/services/store-domain.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdminStoreAccess: vi.fn(),
  ensureStoreEntitlement: vi.fn(),
  getDb: vi.fn(),
  domainCreate: vi.fn(),
  domainFindFirst: vi.fn(),
  domainUpdate: vi.fn(),
  domainUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/repositories/store-entitlement.repository', () => ({
  ensureStoreEntitlement: mocks.ensureStoreEntitlement,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

const domain = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  hostname: 'loja-1.pedidolocal.com.br',
  domainType: 'SUBDOMAIN' as const,
  status: 'PENDING' as const,
  verificationToken: 'token-verificacao-1234567890',
  isPrimary: false,
  verifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StoreDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({
      session: { userId: 'admin-1' },
      store: { slug: 'loja-1' },
    });
    mocks.ensureStoreEntitlement.mockResolvedValue({ customDomainEnabled: false });
    mocks.domainCreate.mockResolvedValue(domain);
    mocks.domainFindFirst.mockResolvedValue(domain);
    mocks.domainUpdateMany.mockResolvedValue({ count: 1 });
    mocks.domainUpdate.mockResolvedValue({
      ...domain,
      status: 'ACTIVE',
      isPrimary: true,
      verifiedAt: new Date(),
    });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
    const tx = {
      storeDomain: {
        create: mocks.domainCreate,
        findFirst: mocks.domainFindFirst,
        updateMany: mocks.domainUpdateMany,
        update: mocks.domainUpdate,
      },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
  });

  it('registra somente o subdomínio exato da loja e não automatiza infraestrutura', async () => {
    await expect(
      requestStoreDomain('tenant-1', 'store-1', {
        hostname: 'loja-1.pedidolocal.com.br',
        domainType: 'SUBDOMAIN',
      }),
    ).resolves.toMatchObject({ domain: { status: 'PENDING' }, storeSlug: 'loja-1' });

    expect(mocks.domainCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        hostname: 'loja-1.pedidolocal.com.br',
      }),
      select: expect.any(Object),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DOMAIN_REQUESTED' }),
    });
  });

  it('bloqueia domínio personalizado sem entitlement', async () => {
    await expect(
      requestStoreDomain('tenant-1', 'store-1', {
        hostname: 'cardapio.exemplo.com.br',
        domainType: 'CUSTOM',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.domainCreate).not.toHaveBeenCalled();
  });

  it('ativa domínio, garante primário único e audita a transição', async () => {
    await changeStoreDomainStatus('tenant-1', 'store-1', {
      domainId: domain.id,
      status: 'ACTIVE',
      isPrimary: true,
    });

    expect(mocks.domainUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        storeId: 'store-1',
        id: { not: domain.id },
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DOMAIN_STATUS_CHANGED',
        metadata: expect.objectContaining({ previousStatus: 'PENDING', nextStatus: 'ACTIVE' }),
      }),
    });
  });
});
