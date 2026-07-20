'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantStoreAccess } from '@/server/auth';
import { Permission } from '@/server/permissions';
import { CACHE_TAGS } from '@/server/cache';
import { actionSuccess, actionError, type ActionResult } from '@/server/errors';
import {
  updateStoreSchema,
  updateStoreSettingsSchema,
  updatePixConfigSchema,
  updateAddressSchema,
  updateHoursSchema,
} from '@/schemas/store';
import * as storeRepo from '@/server/repositories/store.repository';
import { ConflictError } from '@/server/errors';
import { getStoreOverview, rememberActiveStore } from '@/server/services/store-context.service';

// =============================================================================
// Store Actions
// =============================================================================

export async function selectStoreAction(formData: FormData) {
  const context = await rememberActiveStore(String(formData.get('storeId') ?? ''));
  redirect(`/dashboard/stores/${context.store.id}`);
}

export async function getStoreForDashboard(storeId: string) {
  return getStoreOverview(storeId);
}

export async function updateStoreAction(
  storeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { session: ctx, store } = await requireTenantStoreAccess(
      storeId,
      Permission.CONFIGURE_STORE,
    );

    const raw = Object.fromEntries(formData);
    const parsed = updateStoreSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    // Verificar slug único (se mudou)
    if (parsed.data.slug !== store.slug) {
      const existing = await storeRepo.findStoreBySlug(parsed.data.slug);
      if (existing && existing.id !== store.id) {
        return actionError(new ConflictError('Este slug já está em uso.'));
      }
    }

    await storeRepo.updateStore(store.id, ctx.tenantId, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    if (parsed.data.slug !== store.slug) updateTag(CACHE_TAGS.storeSlug(parsed.data.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateStoreSettingsAction(
  storeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { store } = await requireTenantStoreAccess(storeId, Permission.CONFIGURE_STORE);

    const raw = Object.fromEntries(formData);
    const parsed = updateStoreSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreSettings(store.id, {
      ...parsed.data,
      minOrderValue: Math.round(parsed.data.minOrderValue * 100),
    });
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updatePixConfigAction(
  storeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { store } = await requireTenantStoreAccess(storeId, Permission.CONFIGURE_STORE);

    const raw = Object.fromEntries(formData);
    const parsed = updatePixConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreSettings(store.id, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateAddressAction(
  storeId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { store } = await requireTenantStoreAccess(storeId, Permission.CONFIGURE_STORE);

    const raw = Object.fromEntries(formData);
    const parsed = updateAddressSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreAddress(store.id, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateHoursAction(
  storeId: string,
  data: {
    hours: { dayOfWeek: string; openTime: string; closeTime: string; isActive: boolean }[];
  },
): Promise<ActionResult> {
  try {
    const { store } = await requireTenantStoreAccess(storeId, Permission.CONFIGURE_HOURS);

    const parsed = updateHoursSchema.safeParse(data);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertOpeningHours(store.id, parsed.data.hours);
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleStoreStatusAction(
  storeId: string,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
): Promise<ActionResult> {
  try {
    const { session: ctx, store } = await requireTenantStoreAccess(
      storeId,
      Permission.CONFIGURE_STORE,
    );

    await storeRepo.updateStore(store.id, ctx.tenantId, { status });
    updateTag(CACHE_TAGS.store(store.id));
    updateTag(CACHE_TAGS.storeSlug(store.slug));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
