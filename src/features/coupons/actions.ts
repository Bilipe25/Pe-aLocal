'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { CouponAdminInput } from '@/schemas/coupon';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import {
  createCouponForActiveStore,
  deleteCouponForActiveStore,
  updateCouponForActiveStore,
} from '@/server/services/coupon.service';

function couponInput(formData: FormData): CouponAdminInput {
  return {
    code: formData.get('code'),
    type: formData.get('type'),
    value: formData.get('value'),
    minOrderValue: formData.get('minOrderValue'),
    maxDiscount: formData.get('maxDiscount'),
    maxUsages: formData.get('maxUsages'),
    startsAt: formData.get('startsAt'),
    expiresAt: formData.get('expiresAt'),
    isActive: formData.getAll('isActive').includes('true'),
  } as CouponAdminInput;
}

function invalidateCoupons(storeId: string, storeSlug: string) {
  updateTag(CACHE_TAGS.banners(storeId));
  updateTag(CACHE_TAGS.storeSlug(storeSlug));
  revalidatePath('/dashboard/coupons');
  revalidatePath(`/${storeSlug}`);
}

export async function createCouponAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await createCouponForActiveStore(couponInput(formData));
    invalidateCoupons(result.storeId, result.storeSlug);
    return actionSuccess({ id: result.coupon.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCouponAction(
  couponId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const result = await updateCouponForActiveStore(couponId, couponInput(formData));
    invalidateCoupons(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteCouponAction(couponId: string): Promise<ActionResult> {
  try {
    const result = await deleteCouponForActiveStore(couponId);
    invalidateCoupons(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
