'use server';

import { updateTag } from 'next/cache';
import { requireTenantMember } from '@/server/auth';
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
import { ConflictError, NotFoundError } from '@/server/errors';

// =============================================================================
// Store Actions
// =============================================================================

export async function getStoreForDashboard() {
  const ctx = await requireTenantMember();
  const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
  if (!store) throw new NotFoundError('Loja');
  return store;
}

export async function updateStoreAction(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

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
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateStoreSettingsAction(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const raw = Object.fromEntries(formData);
    const parsed = updateStoreSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreSettings(store.id, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updatePixConfigAction(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const raw = Object.fromEntries(formData);
    const parsed = updatePixConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreSettings(store.id, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateAddressAction(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const raw = Object.fromEntries(formData);
    const parsed = updateAddressSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertStoreAddress(store.id, parsed.data);
    updateTag(CACHE_TAGS.store(store.id));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function updateHoursAction(data: { hours: { dayOfWeek: string; openTime: string; closeTime: string; isActive: boolean }[] }): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const parsed = updateHoursSchema.safeParse(data);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    await storeRepo.upsertOpeningHours(store.id, parsed.data.hours);
    updateTag(CACHE_TAGS.store(store.id));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleStoreStatusAction(status: 'OPEN' | 'CLOSED' | 'PAUSED'): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    await storeRepo.updateStore(store.id, ctx.tenantId, { status });
    updateTag(CACHE_TAGS.store(store.id));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
