'use server';

import { revalidatePath } from 'next/cache';

import type { StoreEntitlementInput } from '@/schemas/store-entitlement';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import { updateStoreEntitlement } from '@/server/services/store-entitlement.service';

export async function updateStoreEntitlementAction(
  tenantId: string,
  storeId: string,
  input: StoreEntitlementInput,
): Promise<ActionResult> {
  try {
    await updateStoreEntitlement(tenantId, storeId, input);
    revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
