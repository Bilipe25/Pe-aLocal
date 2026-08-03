'use server';

import { updateTag } from 'next/cache';

import { createDeliveryZoneSchema, deliveryZoneVersionSchema } from '@/schemas/delivery';
import { CACHE_TAGS } from '@/server/cache';
import { actionError, actionSuccess, ValidationError, type ActionResult } from '@/server/errors';
import { Permission } from '@/server/permissions';
import * as deliveryZoneRepo from '@/server/repositories/delivery-zone.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

function deliveryZoneInput(formData: FormData) {
  const starts = formData.getAll('postalCodeStart').map(String);
  const ends = formData.getAll('postalCodeEnd').map(String);
  const ids = formData.getAll('postalRangeId').map(String);
  return {
    name: formData.get('name'),
    fee: formData.get('fee'),
    minOrderValue: formData.get('minOrderValue'),
    estimatedTime: formData.get('estimatedTime'),
    isActive: formData.getAll('isActive').includes('true'),
    sortOrder: formData.get('sortOrder'),
    postalRanges: starts.map((postalCodeStart, index) => ({
      ...(ids[index] ? { id: ids[index] } : {}),
      postalCodeStart,
      postalCodeEnd: ends[index] ?? '',
    })),
  };
}

function parsedDeliveryZone(formData: FormData) {
  const parsed = createDeliveryZoneSchema.safeParse(deliveryZoneInput(formData));
  if (!parsed.success) {
    throw new ValidationError(
      'Revise os dados da zona de entrega.',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return {
    ...parsed.data,
    fee: Math.round(parsed.data.fee * 100),
    minOrderValue:
      parsed.data.minOrderValue == null ? null : Math.round(parsed.data.minOrderValue * 100),
  };
}

function parsedExpectedUpdatedAt(value: FormDataEntryValue | string | null) {
  const parsed = deliveryZoneVersionSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('A versão da zona de entrega é inválida. Atualize a página.');
  }
  return new Date(parsed.data);
}

function invalidateDelivery(storeId: string) {
  updateTag(CACHE_TAGS.delivery(storeId));
  updateTag(CACHE_TAGS.store(storeId));
}

export async function listDeliveryZonesAction() {
  const { session, store } = await requireActiveStoreContext(Permission.CONFIGURE_DELIVERY_ZONES);
  return deliveryZoneRepo.listDeliveryZones(session.tenantId, store.id);
}

export async function createDeliveryZoneAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_DELIVERY);
    const zone = await deliveryZoneRepo.createDeliveryZone({
      tenantId: session.tenantId,
      storeId: store.id,
      userId: session.userId,
      ...parsedDeliveryZone(formData),
    });
    invalidateDelivery(store.id);
    return actionSuccess({ id: zone.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateDeliveryZoneAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_DELIVERY);
    await deliveryZoneRepo.updateDeliveryZone(
      id,
      parsedExpectedUpdatedAt(formData.get('expectedUpdatedAt')),
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        ...parsedDeliveryZone(formData),
      },
    );
    invalidateDelivery(store.id);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteDeliveryZoneAction(
  id: string,
  expectedUpdatedAt: string,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_DELIVERY);
    await deliveryZoneRepo.deleteDeliveryZone(
      id,
      parsedExpectedUpdatedAt(expectedUpdatedAt),
      session.tenantId,
      store.id,
      session.userId,
    );
    invalidateDelivery(store.id);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
