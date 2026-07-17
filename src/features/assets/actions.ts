'use server';

import { revalidatePath, updateTag } from 'next/cache';

import { storeAssetDeleteSchema } from '@/schemas/store-asset';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, ValidationError, type ActionResult } from '@/server/errors';
import {
  deleteStoreAsset,
  garbageCollectDeletedStoreAssets,
} from '@/server/services/store-asset.service';

export async function deleteStoreAssetAction(
  tenantId: string,
  storeId: string,
  assetId: string,
): Promise<ActionResult> {
  try {
    const parsed = storeAssetDeleteSchema.safeParse({ tenantId, storeId, assetId });
    if (!parsed.success) throw new ValidationError('Os identificadores do asset são inválidos.');
    await deleteStoreAsset(parsed.data.tenantId, parsed.data.storeId, parsed.data.assetId);
    updateTag(CACHE_TAGS.assets(storeId));
    updateTag(CACHE_TAGS.asset(assetId));
    revalidatePath(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function garbageCollectStoreAssetsAction(input?: {
  olderThanDays?: number;
  take?: number;
}): Promise<ActionResult<{ scanned: number; deleted: number; before: string }>> {
  try {
    const result = await garbageCollectDeletedStoreAssets(input);
    return actionSuccess({ ...result, before: result.before.toISOString() });
  } catch (error) {
    return actionError(error);
  }
}
