import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@/server/errors';
import { updateStoreEntitlement } from '@/server/services/store-entitlement.service';
import type { StoreEntitlementInput } from '@/schemas/store-entitlement';

const mocks = vi.hoisted(() => ({
  requireSuperAdminStoreAccess: vi.fn(),
  ensureStoreEntitlement: vi.fn(),
  lockStoreEntitlement: vi.fn(),
  getDb: vi.fn(),
  entitlementFind: vi.fn(),
  entitlementUpdate: vi.fn(),
  assetAggregate: vi.fn(),
  bannerCount: vi.fn(),
  domainCount: vi.fn(),
  customizationFind: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/repositories/store-entitlement.repository', () => ({
  entitlementSelect: { id: true },
  ensureStoreEntitlement: mocks.ensureStoreEntitlement,
  lockStoreEntitlement: mocks.lockStoreEntitlement,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

const input: StoreEntitlementInput = {
  maxAssetCount: 25,
  maxAssetStorageBytes: 50 * 1024 * 1024,
  maxBanners: 5,
  allowedLayoutTemplates: ['CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'],
  allowedVisualPresets: [
    'CLASSIC',
    'MODERN',
    'MINIMALIST',
    'BURGER',
    'PIZZA',
    'ACAI_DESSERT',
    'EXECUTIVE_RESTAURANT',
    'DARK_PREMIUM',
  ],
  advancedTypographyEnabled: true,
  customDomainEnabled: false,
  platformBrandingRemovalEnabled: false,
  scheduledBannersEnabled: false,
};

const current = {
  id: 'entitlement-1',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  ...input,
  allowedLayoutTemplates: [...input.allowedLayoutTemplates],
  allowedVisualPresets: [...input.allowedVisualPresets],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StoreEntitlementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({ session: { userId: 'admin-1' } });
    mocks.ensureStoreEntitlement.mockResolvedValue(current);
    mocks.lockStoreEntitlement.mockResolvedValue({ id: current.id });
    mocks.entitlementFind.mockResolvedValue(current);
    mocks.entitlementUpdate.mockResolvedValue(current);
    mocks.assetAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { sizeBytes: 0 } });
    mocks.bannerCount.mockResolvedValue(0);
    mocks.domainCount.mockResolvedValue(0);
    mocks.customizationFind.mockResolvedValue(null);
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
    const tx = {
      storeEntitlement: {
        findUniqueOrThrow: mocks.entitlementFind,
        update: mocks.entitlementUpdate,
      },
      storeAsset: { aggregate: mocks.assetAggregate },
      storeBanner: { count: mocks.bannerCount },
      storeDomain: { count: mocks.domainCount },
      storeCustomization: { findUnique: mocks.customizationFind },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
  });

  it('atualiza limites sob lock e gera auditoria com valores seguros', async () => {
    await updateStoreEntitlement('tenant-1', 'store-1', input);

    expect(mocks.lockStoreEntitlement).toHaveBeenCalledWith(
      expect.any(Object),
      'tenant-1',
      'store-1',
    );
    expect(mocks.entitlementUpdate).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      data: input,
      select: { id: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ENTITLEMENT_UPDATED',
        tenantId: 'tenant-1',
        storeId: 'store-1',
      }),
    });
  });

  it('não reduz o limite abaixo do uso atual', async () => {
    mocks.assetAggregate.mockResolvedValue({ _count: { id: 3 }, _sum: { sizeBytes: 1024 } });

    await expect(
      updateStoreEntitlement('tenant-1', 'store-1', { ...input, maxAssetCount: 2 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.entitlementUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});
