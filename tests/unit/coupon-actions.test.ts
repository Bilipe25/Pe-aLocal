import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCouponForActiveStore: vi.fn(),
  updateCouponForActiveStore: vi.fn(),
  deleteCouponForActiveStore: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({
  updateTag: mocks.updateTag,
  revalidatePath: mocks.revalidatePath,
}));
vi.mock('@/server/services/coupon.service', () => ({
  createCouponForActiveStore: mocks.createCouponForActiveStore,
  updateCouponForActiveStore: mocks.updateCouponForActiveStore,
  deleteCouponForActiveStore: mocks.deleteCouponForActiveStore,
}));

import {
  createCouponAction,
  deleteCouponAction,
  updateCouponAction,
} from '@/features/coupons/actions';

function formData() {
  const data = new FormData();
  data.set('code', 'BEMVINDO10');
  data.set('type', 'PERCENTAGE');
  data.set('value', '10');
  data.set('minOrderValue', '20');
  data.set('maxDiscount', '10');
  data.set('maxUsages', '100');
  data.set('startsAt', '');
  data.set('expiresAt', '');
  data.set('isActive', 'false');
  data.append('isActive', 'true');
  return data;
}

describe('coupon actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const result = {
      coupon: { id: '10000000-0000-4000-8000-000000000001' },
      storeId: 'store-a',
      storeSlug: 'loja-a',
    };
    mocks.createCouponForActiveStore.mockResolvedValue(result);
    mocks.updateCouponForActiveStore.mockResolvedValue(result);
    mocks.deleteCouponForActiveStore.mockResolvedValue({
      storeId: 'store-a',
      storeSlug: 'loja-a',
    });
  });

  it('envia somente campos permitidos e invalida caches após criar', async () => {
    const result = await createCouponAction(formData());

    expect(result.success).toBe(true);
    expect(mocks.createCouponForActiveStore).toHaveBeenCalledWith({
      code: 'BEMVINDO10',
      type: 'PERCENTAGE',
      value: '10',
      minOrderValue: '20',
      maxDiscount: '10',
      maxUsages: '100',
      startsAt: '',
      expiresAt: '',
      isActive: true,
    });
    expect(mocks.updateTag).toHaveBeenCalledWith('banners:store-a');
    expect(mocks.updateTag).toHaveBeenCalledWith('store-slug:loja-a');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/coupons');
  });

  it('atualiza e exclui pelo identificador sem aceitar escopo do navegador', async () => {
    const couponId = '10000000-0000-4000-8000-000000000001';

    await updateCouponAction(couponId, formData());
    await deleteCouponAction(couponId);

    expect(mocks.updateCouponForActiveStore).toHaveBeenCalledWith(couponId, expect.any(Object));
    expect(mocks.deleteCouponForActiveStore).toHaveBeenCalledWith(couponId);
  });
});
