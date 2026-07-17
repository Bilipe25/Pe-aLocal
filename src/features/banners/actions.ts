'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { StoreBannerInput } from '@/schemas/store-banner';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import { deleteStoreBanner, saveStoreBanner } from '@/server/services/store-banner.service';

function revalidate(tenantId: string, storeId: string, storeSlug: string) {
  updateTag(CACHE_TAGS.banners(storeId));
  updateTag(CACHE_TAGS.storeSlug(storeSlug));
  revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
  revalidatePath(`/${storeSlug}`);
}

export async function saveStoreBannerAction(
  tenantId: string,
  storeId: string,
  input: StoreBannerInput,
): Promise<ActionResult> {
  try {
    const result = await saveStoreBanner(tenantId, storeId, input);
    revalidate(tenantId, storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteStoreBannerAction(
  tenantId: string,
  storeId: string,
  bannerId: string,
): Promise<ActionResult> {
  try {
    const result = await deleteStoreBanner(tenantId, storeId, bannerId);
    revalidate(tenantId, storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
