'use server';

import { revalidatePath, updateTag } from 'next/cache';

import type { ComboAdminInput, ProductPromotionAdminInput } from '@/schemas/offers';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, type ActionResult, ValidationError } from '@/server/errors';
import {
  archiveComboForActiveStore,
  archiveProductPromotionForActiveStore,
  createComboForActiveStore,
  createProductPromotionForActiveStore,
  setComboActiveForActiveStore,
  setProductPromotionActiveForActiveStore,
  updateComboForActiveStore,
  updateProductPromotionForActiveStore,
} from '@/server/services/offer.service';

function selectedWeekdays(formData: FormData) {
  return formData.getAll('weekdays').map(String);
}

function parseComboItems(formData: FormData) {
  const raw = formData.get('items');
  if (typeof raw !== 'string') return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ValidationError('Os componentes do combo são inválidos.');
  }
}

function comboInput(formData: FormData): ComboAdminInput {
  return {
    name: formData.get('name'),
    description: formData.get('description'),
    specialPrice: formData.get('specialPrice'),
    isActive: formData.getAll('isActive').includes('true'),
    sortOrder: formData.get('sortOrder') ?? 0,
    items: parseComboItems(formData),
    startsOn: formData.get('startsOn'),
    endsOnExclusive: formData.get('endsOnExclusive'),
    weekdays: selectedWeekdays(formData),
    startTime: formData.get('startTime'),
    endTimeExclusive: formData.get('endTimeExclusive'),
  } as ComboAdminInput;
}

function promotionInput(formData: FormData): ProductPromotionAdminInput {
  return {
    productId: formData.get('productId'),
    promotionalPrice: formData.get('promotionalPrice'),
    isActive: formData.getAll('isActive').includes('true'),
    startsOn: formData.get('startsOn'),
    endsOnExclusive: formData.get('endsOnExclusive'),
    weekdays: selectedWeekdays(formData),
    startTime: formData.get('startTime'),
    endTimeExclusive: formData.get('endTimeExclusive'),
  } as ProductPromotionAdminInput;
}

function invalidateOffers(storeId: string, storeSlug: string) {
  updateTag(CACHE_TAGS.offers(storeId));
  updateTag(CACHE_TAGS.catalog(storeId));
  updateTag(CACHE_TAGS.storeSlug(storeSlug));
  revalidatePath('/dashboard/offers');
  revalidatePath(`/${storeSlug}`);
  revalidatePath(`/${storeSlug}/cart`);
}

export async function createComboAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await createComboForActiveStore(comboInput(formData));
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess({ id: result.combo.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateComboAction(
  id: string,
  version: number,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const result = await updateComboForActiveStore(id, version, comboInput(formData));
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveComboAction(id: string, version: number): Promise<ActionResult> {
  try {
    const result = await archiveComboForActiveStore(id, version);
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function createProductPromotionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await createProductPromotionForActiveStore(promotionInput(formData));
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess({ id: result.promotion.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProductPromotionAction(
  id: string,
  version: number,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const result = await updateProductPromotionForActiveStore(
      id,
      version,
      promotionInput(formData),
    );
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveProductPromotionAction(
  id: string,
  version: number,
): Promise<ActionResult> {
  try {
    const result = await archiveProductPromotionForActiveStore(id, version);
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function setOfferActiveAction(
  kind: 'COMBO' | 'PRODUCT_PROMOTION',
  id: string,
  version: number,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const result =
      kind === 'COMBO'
        ? await setComboActiveForActiveStore(id, version, isActive)
        : await setProductPromotionActiveForActiveStore(id, version, isActive);
    invalidateOffers(result.storeId, result.storeSlug);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
