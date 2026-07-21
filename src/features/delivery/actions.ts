'use server';

import { updateTag } from 'next/cache';
import { Permission } from '@/server/permissions';
import { CACHE_TAGS } from '@/server/cache';
import { actionSuccess, actionError, NotFoundError, type ActionResult } from '@/server/errors';
import { createDeliveryZoneSchema } from '@/schemas/delivery';
import * as dzRepo from '@/server/repositories/delivery-zone.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

// =============================================================================
// Delivery Zone Actions
// =============================================================================

export async function listDeliveryZonesAction() {
  const { session, store } = await requireActiveStoreContext();
  return dzRepo.listDeliveryZones(session.tenantId, store.id);
}

export async function createDeliveryZoneAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_DELIVERY);

    const raw = Object.fromEntries(formData);
    const parsed = createDeliveryZoneSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const zone = await dzRepo.createDeliveryZone({
      tenantId: session.tenantId,
      storeId: store.id,
      ...parsed.data,
      fee: Math.round(parsed.data.fee * 100),
      minOrderValue: parsed.data.minOrderValue ? Math.round(parsed.data.minOrderValue * 100) : null,
    });

    updateTag(CACHE_TAGS.delivery(store.id));
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

    const raw = Object.fromEntries(formData);
    const parsed = createDeliveryZoneSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const zone = await dzRepo.findDeliveryZoneById(id, session.tenantId);
    if (!zone || zone.storeId !== store.id)
      return actionError(new NotFoundError('Zona de entrega'));
    await dzRepo.updateDeliveryZone(id, session.tenantId, {
      ...parsed.data,
      fee: Math.round(parsed.data.fee * 100),
      minOrderValue: parsed.data.minOrderValue ? Math.round(parsed.data.minOrderValue * 100) : null,
    });

    updateTag(CACHE_TAGS.delivery(zone.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteDeliveryZoneAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_DELIVERY);
    const zone = await dzRepo.findDeliveryZoneById(id, session.tenantId);
    if (!zone || zone.storeId !== store.id)
      return actionError(new NotFoundError('Zona de entrega'));
    await dzRepo.deleteDeliveryZone(id, session.tenantId);
    updateTag(CACHE_TAGS.delivery(zone.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
