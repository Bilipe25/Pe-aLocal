'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { StoreDomainRequestInput, StoreDomainStatusInput } from '@/schemas/store-domain';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import {
  changeStoreDomainStatus,
  requestStoreDomain,
} from '@/server/services/store-domain.service';

function revalidate(tenantId: string, storeId: string, storeSlug: string) {
  updateTag(CACHE_TAGS.domains(storeId));
  updateTag(CACHE_TAGS.storeSlug(storeSlug));
  revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
  revalidatePath(`/${storeSlug}`);
}

export async function requestStoreDomainAction(
  tenantId: string,
  storeId: string,
  input: StoreDomainRequestInput,
): Promise<ActionResult> {
  try {
    const result = await requestStoreDomain(tenantId, storeId, input);
    revalidate(tenantId, storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function changeStoreDomainStatusAction(
  tenantId: string,
  storeId: string,
  input: StoreDomainStatusInput,
): Promise<ActionResult> {
  try {
    const result = await changeStoreDomainStatus(tenantId, storeId, input);
    revalidate(tenantId, storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
