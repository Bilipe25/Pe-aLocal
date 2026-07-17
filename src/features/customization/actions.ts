'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { StoreCustomizationConfig } from '@/schemas/customization';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import {
  discardCustomizationDraft,
  publishCustomization,
  restoreCustomizationRevision,
  restoreDefaultCustomization,
  saveCustomizationDraft,
} from '@/server/services/store-customization.service';

function revalidateEditor(tenantId: string, storeId: string) {
  revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
}

export async function saveCustomizationDraftAction(
  tenantId: string,
  storeId: string,
  input: { config: StoreCustomizationConfig; expectedDraftVersion: number },
): Promise<ActionResult<{ draftVersion: number }>> {
  try {
    const result = await saveCustomizationDraft(tenantId, storeId, input);
    revalidateEditor(tenantId, storeId);
    return actionSuccess({ draftVersion: result.draftVersion });
  } catch (error) {
    return actionError(error);
  }
}

export async function discardCustomizationDraftAction(
  tenantId: string,
  storeId: string,
  expectedDraftVersion: number,
): Promise<ActionResult<{ draftVersion: number }>> {
  try {
    const result = await discardCustomizationDraft(tenantId, storeId, expectedDraftVersion);
    revalidateEditor(tenantId, storeId);
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function publishCustomizationAction(
  tenantId: string,
  storeId: string,
  input: { expectedDraftVersion: number; reason: string },
): Promise<ActionResult<{ draftVersion: number; publishedVersion: number }>> {
  try {
    const result = await publishCustomization(tenantId, storeId, input);
    updateTag(CACHE_TAGS.customization(storeId));
    updateTag(CACHE_TAGS.store(storeId));
    revalidateEditor(tenantId, storeId);
    revalidatePath(`/${result.storeSlug}`);
    return actionSuccess({
      draftVersion: result.draftVersion,
      publishedVersion: result.publishedVersion,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreCustomizationRevisionAction(
  tenantId: string,
  storeId: string,
  revisionId: string,
  input: { expectedDraftVersion: number; reason: string },
): Promise<ActionResult<{ draftVersion: number }>> {
  try {
    const result = await restoreCustomizationRevision(tenantId, storeId, revisionId, input);
    revalidateEditor(tenantId, storeId);
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreDefaultCustomizationAction(
  tenantId: string,
  storeId: string,
  input: { expectedDraftVersion: number; reason: string },
): Promise<ActionResult<{ draftVersion: number }>> {
  try {
    const result = await restoreDefaultCustomization(tenantId, storeId, input);
    revalidateEditor(tenantId, storeId);
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}
