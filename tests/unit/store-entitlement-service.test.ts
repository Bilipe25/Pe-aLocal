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
  slaDeliveryUpdate: vi.fn(),
  slaAlertUpdate: vi.fn(),
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
  onlinePaymentsEnabled: false,
  operationalSlaEnabled: false,
  kdsEnabled: false,
  advancedReportsEnabled: false,
  orderPrintingEnabled: false,
};

const current = {
  id: 'entitlement-1',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  ...input,
  operationalSlaEnabledAt: null,
  allowedLayoutTemplates: [...input.allowedLayoutTemplates],
  allowedVisualPresets: [...input.allowedVisualPresets],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('StoreEntitlementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({
      session: { userId: 'admin-1' },
      store: { slug: 'loja-teste' },
    });
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
      $queryRaw: vi.fn().mockResolvedValue([{ now: new Date('2026-08-17T12:00:00.000Z') }]),
      storeEntitlement: {
        findUniqueOrThrow: mocks.entitlementFind,
        update: mocks.entitlementUpdate,
      },
      storeAsset: { aggregate: mocks.assetAggregate },
      storeBanner: { count: mocks.bannerCount },
      storeDomain: { count: mocks.domainCount },
      storeCustomization: { findUnique: mocks.customizationFind },
      auditLog: { create: mocks.auditCreate },
      orderOperationalSlaDelivery: { updateMany: mocks.slaDeliveryUpdate },
      orderOperationalSlaAlert: { updateMany: mocks.slaAlertUpdate },
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
      data: { ...input, operationalSlaEnabledAt: null },
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

  it('grava o relógio do banco somente na primeira ativação', async () => {
    await updateStoreEntitlement('tenant-1', 'store-1', {
      ...input,
      operationalSlaEnabled: true,
    });

    expect(mocks.entitlementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationalSlaEnabled: true,
          operationalSlaEnabledAt: new Date('2026-08-17T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('preserva a ativação existente em true para true', async () => {
    const enabledAt = new Date('2026-08-17T10:00:00.000Z');
    mocks.entitlementFind.mockResolvedValue({
      ...current,
      operationalSlaEnabled: true,
      operationalSlaEnabledAt: enabledAt,
    });

    await updateStoreEntitlement('tenant-1', 'store-1', {
      ...input,
      operationalSlaEnabled: true,
    });

    expect(mocks.entitlementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ operationalSlaEnabledAt: enabledAt }),
      }),
    );
  });

  it('limpa a ativação e encerra deliveries pendentes ao desabilitar', async () => {
    mocks.entitlementFind.mockResolvedValue({
      ...current,
      operationalSlaEnabled: true,
      operationalSlaEnabledAt: new Date('2026-08-17T10:00:00.000Z'),
    });

    await updateStoreEntitlement('tenant-1', 'store-1', input);

    expect(mocks.entitlementUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ operationalSlaEnabledAt: null }),
      }),
    );
    expect(mocks.slaDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'operational_sla_disabled',
        }),
      }),
    );
    expect(mocks.slaAlertUpdate).toHaveBeenCalled();
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
