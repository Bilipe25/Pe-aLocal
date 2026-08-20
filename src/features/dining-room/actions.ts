'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { diningSessionTokenFingerprint } from '@/domain/dining-room';
import { actionError, actionSuccess, RateLimitError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  closeDiningSession,
  createPublicDiningServiceRequest,
  getDiningRoomSnapshot,
  getDiningSessionDetail,
  resolveDiningServiceRequest,
  transferDiningSession,
} from '@/server/services/dining-table-session.service';

function refreshDiningRoom() {
  revalidatePath('/dashboard/dining-room');
  revalidatePath('/dashboard/orders');
  revalidatePath('/dashboard/kds');
}

function clientAddress(value: Headers) {
  return (
    value.get('cf-connecting-ip') ??
    value.get('x-real-ip') ??
    value.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function getDiningRoomSnapshotAction() {
  try {
    return actionSuccess(await getDiningRoomSnapshot());
  } catch (error) {
    return actionError(error);
  }
}

export async function getDiningSessionDetailAction(sessionId: string) {
  try {
    return actionSuccess(await getDiningSessionDetail(sessionId));
  } catch (error) {
    return actionError(error);
  }
}

export async function resolveDiningServiceRequestAction(storeId: string, input: unknown) {
  try {
    const result = await resolveDiningServiceRequest(storeId, input as never);
    refreshDiningRoom();
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function closeDiningSessionAction(storeId: string, input: unknown) {
  try {
    const result = await closeDiningSession(storeId, input as never);
    refreshDiningRoom();
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function transferDiningSessionAction(storeId: string, input: unknown) {
  try {
    const result = await transferDiningSession(storeId, input as never);
    refreshDiningRoom();
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function requestDiningServiceAction(sessionToken: string, input: unknown) {
  try {
    const requestHeaders = await headers();
    const fingerprint = await diningSessionTokenFingerprint(sessionToken);
    const limit = await getRateLimiter().check({
      identifier: `dining-session-public:${fingerprint}:${clientAddress(requestHeaders)}`,
      ...RATE_LIMITS.diningSessionPublic,
      strict: isDeployedRuntime(),
    });
    if (limit.unavailable) {
      throw new RateLimitError('Não foi possível validar a solicitação agora. Tente novamente.');
    }
    if (!limit.allowed) {
      throw new RateLimitError('A equipe já foi avisada. Aguarde um instante.');
    }
    return actionSuccess(await createPublicDiningServiceRequest(sessionToken, input as never));
  } catch (error) {
    return actionError(error);
  }
}
