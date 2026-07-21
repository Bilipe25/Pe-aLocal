'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';

import { CACHE_TAGS } from '@/server/cache';
import { actionError } from '@/server/errors';
import { fieldErrorsFromDetails, type StoreFormActionResult } from '@/features/stores/form-state';
import { rememberActiveStore } from '@/server/services/store-context.service';
import {
  removeStoreScheduleException,
  saveStoreScheduleException,
  updateStoreAddressSettings,
  updateStoreGeneralSettings,
  updateStoreHoursSettings,
  updateStoreOperationalSettings,
  updateStorePaymentSettings,
  updateStoreStatus,
  type StoreConfigurationMutationResult,
} from '@/server/services/store-settings.service';

export async function selectStoreAction(formData: FormData) {
  const context = await rememberActiveStore(String(formData.get('storeId') ?? ''));
  redirect(`/dashboard/stores/${context.store.id}`);
}

function invalidateStore(result: StoreConfigurationMutationResult) {
  updateTag(CACHE_TAGS.store(result.storeId));
  updateTag(CACHE_TAGS.storeSlug(result.storeSlug));
  if (result.previousStoreSlug && result.previousStoreSlug !== result.storeSlug) {
    updateTag(CACHE_TAGS.storeSlug(result.previousStoreSlug));
  }
}

async function executeStoreMutation(
  mutation: () => Promise<StoreConfigurationMutationResult>,
): Promise<StoreFormActionResult> {
  try {
    const result = await mutation();
    invalidateStore(result);
    return {
      success: true,
      data: { configurationVersion: result.configurationVersion },
      message: 'Alterações salvas.',
      configurationVersion: result.configurationVersion,
    };
  } catch (error) {
    const result = actionError(error);
    if (result.success) throw new Error('Estado de erro inesperado.');
    const fieldErrors = fieldErrorsFromDetails(result.error.details);
    return {
      ...result,
      success: false,
      formError: result.error.message,
      ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    };
  }
}

export async function updateStoreAction(
  storeId: string,
  expectedConfigurationVersion: number,
  formData: FormData,
) {
  return executeStoreMutation(() =>
    updateStoreGeneralSettings(storeId, expectedConfigurationVersion, formData),
  );
}

export async function updateStoreSettingsAction(
  storeId: string,
  expectedConfigurationVersion: number,
  formData: FormData,
) {
  return executeStoreMutation(() =>
    updateStoreOperationalSettings(storeId, expectedConfigurationVersion, formData),
  );
}

export async function updatePixConfigAction(
  storeId: string,
  expectedConfigurationVersion: number,
  formData: FormData,
) {
  return executeStoreMutation(() =>
    updateStorePaymentSettings(storeId, expectedConfigurationVersion, formData),
  );
}

export async function updateAddressAction(
  storeId: string,
  expectedConfigurationVersion: number,
  formData: FormData,
) {
  return executeStoreMutation(() =>
    updateStoreAddressSettings(storeId, expectedConfigurationVersion, formData),
  );
}

export async function updateHoursAction(
  storeId: string,
  expectedConfigurationVersion: number,
  data: {
    timeZone: string;
    hours: { dayOfWeek: string; openTime: string; closeTime: string; isActive: boolean }[];
  },
) {
  return executeStoreMutation(() =>
    updateStoreHoursSettings(storeId, expectedConfigurationVersion, data),
  );
}

export async function saveScheduleExceptionAction(
  storeId: string,
  expectedConfigurationVersion: number,
  data: {
    date: string;
    type: 'CLOSED' | 'CUSTOM_HOURS';
    openTime?: string;
    closeTime?: string;
    reason?: string;
  },
) {
  return executeStoreMutation(() =>
    saveStoreScheduleException(storeId, expectedConfigurationVersion, data),
  );
}

export async function removeScheduleExceptionAction(
  storeId: string,
  expectedConfigurationVersion: number,
  exceptionId: string,
) {
  return executeStoreMutation(() =>
    removeStoreScheduleException(storeId, expectedConfigurationVersion, exceptionId),
  );
}

export async function toggleStoreStatusAction(
  storeId: string,
  expectedConfigurationVersion: number,
  status: 'OPEN' | 'CLOSED' | 'PAUSED',
) {
  return executeStoreMutation(() =>
    updateStoreStatus(storeId, expectedConfigurationVersion, status),
  );
}
