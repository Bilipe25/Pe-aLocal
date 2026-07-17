import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, ValidationError } from '@/server/errors';
import { saveStoreBanner } from '@/server/services/store-banner.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdminStoreAccess: vi.fn(),
  ensureStoreEntitlement: vi.fn(),
  lockStoreEntitlement: vi.fn(),
  getDb: vi.fn(),
  bannerCount: vi.fn(),
  bannerCreate: vi.fn(),
  bannerFindFirst: vi.fn(),
  assetFindFirst: vi.fn(),
  categoryFindFirst: vi.fn(),
  productFindFirst: vi.fn(),
  couponFindFirst: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/repositories/store-entitlement.repository', () => ({
  ensureStoreEntitlement: mocks.ensureStoreEntitlement,
  lockStoreEntitlement: mocks.lockStoreEntitlement,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

const banner = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  assetId: null,
  title: 'Promoção',
  subtitle: null,
  buttonText: null,
  destinationType: 'NONE' as const,
  destinationValue: null,
  startsAt: null,
  endsAt: null,
  isActive: false,
  priority: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  asset: null,
};

const baseInput = {
  assetId: null,
  title: 'Promoção',
  subtitle: null,
  buttonText: null,
  destinationType: 'NONE' as const,
  destinationValue: null,
  startsAt: null,
  endsAt: null,
  isActive: false,
  priority: 10,
};

describe('StoreBannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({
      session: { userId: 'admin-1' },
      store: { slug: 'loja-1' },
    });
    mocks.ensureStoreEntitlement.mockResolvedValue({ id: 'entitlement-1' });
    mocks.lockStoreEntitlement.mockResolvedValue({
      maxBanners: 5,
      scheduledBannersEnabled: true,
    });
    mocks.bannerCount.mockResolvedValue(0);
    mocks.bannerFindFirst.mockResolvedValue(null);
    mocks.bannerCreate.mockResolvedValue(banner);
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
    const tx = {
      storeBanner: {
        count: mocks.bannerCount,
        findFirst: mocks.bannerFindFirst,
        create: mocks.bannerCreate,
      },
      storeAsset: { findFirst: mocks.assetFindFirst },
      category: { findFirst: mocks.categoryFindFirst },
      product: { findFirst: mocks.productFindFirst },
      coupon: { findFirst: mocks.couponFindFirst },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
  });

  it('cria banner escopado e gera auditoria', async () => {
    await expect(saveStoreBanner('tenant-1', 'store-1', baseInput)).resolves.toMatchObject({
      storeSlug: 'loja-1',
      banner: { id: banner.id },
    });
    expect(mocks.bannerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1' }),
      select: expect.any(Object),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'BANNER_CREATED', entityId: banner.id }),
    });
  });

  it('bloqueia mais de três banners ativos no mesmo período', async () => {
    mocks.bannerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(3);

    await expect(
      saveStoreBanner('tenant-1', 'store-1', { ...baseInput, isActive: true }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.bannerCreate).not.toHaveBeenCalled();
  });

  it('não aceita categoria de outra loja como destino', async () => {
    mocks.categoryFindFirst.mockResolvedValue(null);

    await expect(
      saveStoreBanner('tenant-1', 'store-1', {
        ...baseInput,
        buttonText: 'Ver categoria',
        destinationType: 'CATEGORY',
        destinationValue: '7135d569-c2f3-4dc4-a41f-488d63e3620d',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.categoryFindFirst).toHaveBeenCalledWith({
      where: {
        id: '7135d569-c2f3-4dc4-a41f-488d63e3620d',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        isActive: true,
      },
      select: { id: true },
    });
  });

  it('bloqueia agendamento quando o entitlement está desabilitado', async () => {
    mocks.lockStoreEntitlement.mockResolvedValue({
      maxBanners: 5,
      scheduledBannersEnabled: false,
    });

    await expect(
      saveStoreBanner('tenant-1', 'store-1', {
        ...baseInput,
        startsAt: '2026-08-01T12:00:00-03:00',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
