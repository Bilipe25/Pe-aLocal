import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError, BusinessRuleError, NotFoundError } from '@/server/errors';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  transaction: vi.fn(),
  listScopedCoupons: vi.fn(),
  countScopedCoupons: vi.fn(),
  findScopedCoupon: vi.fn(),
  findScopedCouponByCode: vi.fn(),
  createScopedCoupon: vi.fn(),
  updateScopedCoupon: vi.fn(),
  deleteScopedCoupon: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));
vi.mock('@/server/repositories/coupon.repository', () => ({
  listScopedCoupons: mocks.listScopedCoupons,
  countScopedCoupons: mocks.countScopedCoupons,
  findScopedCoupon: mocks.findScopedCoupon,
  findScopedCouponByCode: mocks.findScopedCouponByCode,
  createScopedCoupon: mocks.createScopedCoupon,
  updateScopedCoupon: mocks.updateScopedCoupon,
  deleteScopedCoupon: mocks.deleteScopedCoupon,
}));
vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));

import {
  createCouponForActiveStore,
  deleteCouponForActiveStore,
  listCouponsForActiveStore,
  updateCouponForActiveStore,
} from '@/server/services/coupon.service';

const context = {
  session: {
    userId: 'user-owner',
    tenantId: 'tenant-a',
    tenantRole: 'OWNER',
  },
  store: {
    id: 'store-a',
    tenantId: 'tenant-a',
    slug: 'loja-a',
  },
};

const coupon = {
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: 'tenant-a',
  storeId: 'store-a',
  code: 'BEMVINDO10',
  type: 'PERCENTAGE' as const,
  value: 10,
  minOrderValue: null,
  maxDiscount: 1_000,
  maxUsages: 100,
  usageCount: 2,
  isActive: true,
  startsAt: null,
  expiresAt: null,
  createdAt: new Date('2026-07-27T12:00:00Z'),
  updatedAt: new Date('2026-07-27T12:00:00Z'),
  _count: { usages: 2 },
};

const input = {
  code: 'bemvindo10',
  type: 'PERCENTAGE' as const,
  value: 10,
  minOrderValue: '',
  maxDiscount: '10',
  maxUsages: '100',
  startsAt: '',
  expiresAt: '',
  isActive: true,
};

describe('coupon service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue(context);
    mocks.transaction.mockImplementation(
      async (callback: (tx: Record<string, never>) => Promise<unknown>) => callback({}),
    );
    mocks.findScopedCouponByCode.mockResolvedValue(null);
    mocks.createScopedCoupon.mockResolvedValue(coupon);
    mocks.updateScopedCoupon.mockResolvedValue(coupon);
    mocks.findScopedCoupon.mockResolvedValue(coupon);
    mocks.listScopedCoupons.mockResolvedValue([coupon]);
    mocks.countScopedCoupons.mockResolvedValue(1);
  });

  it('lista apenas cupons do tenant e da loja autorizados', async () => {
    const result = await listCouponsForActiveStore({ page: 1 });

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.VIEW_COUPONS);
    expect(mocks.listScopedCoupons).toHaveBeenCalledWith('tenant-a', 'store-a', {
      skip: 0,
      take: 25,
    });
    expect(mocks.countScopedCoupons).toHaveBeenCalledWith('tenant-a', 'store-a');
    expect(result.coupons).toEqual([coupon]);
  });

  it('cria cupom escopado e auditoria na mesma transação', async () => {
    await createCouponForActiveStore(input);

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.MANAGE_COUPONS);
    expect(mocks.createScopedCoupon).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        code: 'BEMVINDO10',
        maxDiscount: 1_000,
      }),
    );
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'user-owner',
        action: 'COUPON_CREATED',
        entityId: coupon.id,
      }),
      expect.anything(),
    );
  });

  it('não atualiza cupom ausente ou pertencente a outro escopo', async () => {
    mocks.findScopedCoupon.mockResolvedValue(null);

    await expect(updateCouponForActiveStore(coupon.id, input)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(mocks.findScopedCoupon).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-a',
      'store-a',
      coupon.id,
    );
    expect(mocks.updateScopedCoupon).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it('não permite reduzir o limite abaixo dos usos registrados', async () => {
    await expect(
      updateCouponForActiveStore(coupon.id, { ...input, maxUsages: '1' }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(mocks.updateScopedCoupon).not.toHaveBeenCalled();
  });

  it('preserva histórico e bloqueia exclusão de cupom utilizado', async () => {
    await expect(deleteCouponForActiveStore(coupon.id)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(mocks.deleteScopedCoupon).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it('exclui cupom sem uso e registra COUPON_DELETED', async () => {
    mocks.findScopedCoupon.mockResolvedValue({
      ...coupon,
      usageCount: 0,
      _count: { usages: 0 },
    });

    await deleteCouponForActiveStore(coupon.id);

    expect(mocks.deleteScopedCoupon).toHaveBeenCalledWith(expect.anything(), coupon.id);
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COUPON_DELETED',
        tenantId: 'tenant-a',
        storeId: 'store-a',
      }),
      expect.anything(),
    );
  });

  it('exige permissão de edição antes de validar ou persistir', async () => {
    mocks.requireActiveStoreContext.mockRejectedValue(new AuthorizationError());

    await expect(createCouponForActiveStore(input)).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
