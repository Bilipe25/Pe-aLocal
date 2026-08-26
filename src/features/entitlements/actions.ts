'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { StoreEntitlementInput } from '@/schemas/store-entitlement';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import { updateStoreEntitlement } from '@/server/services/store-entitlement.service';

export async function updateStoreEntitlementAction(
  tenantId: string,
  storeId: string,
  input: StoreEntitlementInput,
): Promise<ActionResult> {
  try {
    const result = await updateStoreEntitlement(tenantId, storeId, input);
    updateTag(CACHE_TAGS.store(storeId));
    updateTag(CACHE_TAGS.storeSlug(result.storeSlug));
    updateTag(CACHE_TAGS.paymentMethods(storeId));
    updateTag(CACHE_TAGS.capabilities(storeId));
    revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
    revalidatePath(`/dashboard/stores/${storeId}/payments`);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
