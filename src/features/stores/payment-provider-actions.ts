'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';

import { actionError, actionSuccess } from '@/server/errors';
import { CACHE_TAGS } from '@/server/cache';
import {
  disconnectMercadoPago,
  startMercadoPagoOAuth,
  updateStorePaymentMode,
} from '@/server/services/mercado-pago-connection.service';

function paymentsPath(storeId: string) {
  return `/dashboard/stores/${encodeURIComponent(storeId)}/payments`;
}

export async function connectMercadoPagoAction(storeId: string) {
  let authorizationUrl: string;
  try {
    authorizationUrl = await startMercadoPagoOAuth(storeId);
  } catch {
    redirect(`${paymentsPath(storeId)}?connection=error`);
  }
  redirect(authorizationUrl);
}

function invalidatePublicPayments(storeId: string, storeSlug: string) {
  updateTag(CACHE_TAGS.store(storeId));
  updateTag(CACHE_TAGS.storeSlug(storeSlug));
  updateTag(CACHE_TAGS.paymentMethods(storeId));
}

export async function disconnectMercadoPagoAction(
  storeId: string,
  expectedConfigurationVersion: number,
) {
  try {
    const result = await disconnectMercadoPago(storeId, expectedConfigurationVersion);
    invalidatePublicPayments(result.storeId, result.storeSlug);
    revalidatePath(paymentsPath(storeId));
    return actionSuccess({ configurationVersion: result.configurationVersion });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateStorePaymentModeAction(
  storeId: string,
  expectedConfigurationVersion: number,
  mode: 'MANUAL' | 'ONLINE',
) {
  try {
    const result = await updateStorePaymentMode(storeId, expectedConfigurationVersion, mode);
    invalidatePublicPayments(result.storeId, result.storeSlug);
    revalidatePath(paymentsPath(storeId));
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}
