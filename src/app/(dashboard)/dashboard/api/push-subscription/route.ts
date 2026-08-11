import { z } from 'zod';

import { webPushDisableInputSchema, webPushSubscriptionInputSchema } from '@/schemas/web-push';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  clearMerchantPushDeviceCookie,
  disableStoreStaffPushSubscription,
  enableStoreStaffPushSubscription,
  getStoreStaffPushSubscriptionState,
  setMerchantPushDeviceCookie,
} from '@/server/services/store-staff-push-subscription.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

const querySchema = z.object({
  endpointHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

function enabled() {
  return String(process.env.MERCHANT_WEB_PUSH_ENABLED) === 'true';
}

function contextFrom(active: Awaited<ReturnType<typeof requireActiveStoreContext>>) {
  return {
    userId: active.session.userId,
    tenantId: active.session.tenantId,
    tenantRole: active.session.tenantRole,
    storeId: active.store.id,
  };
}

function assertMutationRequest(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ValidationError('RequisiÃ§Ã£o invÃ¡lida.');
  }
  const origin = request.headers.get('origin');
  if (
    (isDeployedRuntime() && !origin) ||
    (origin && new URL(origin).origin !== new URL(request.url).origin)
  ) {
    throw new ValidationError('Origem invÃ¡lida.');
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('ConteÃºdo invÃ¡lido.');
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 8_192) throw new ValidationError('ConteÃºdo muito grande.');
  return origin ?? new URL(request.url).origin;
}

async function readLimitedJson(request: Request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 8_192) {
    throw new ValidationError('ConteÃºdo muito grande.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError('ConteÃºdo invÃ¡lido.');
  }
}

async function assertRateLimit(userId: string) {
  const result = await getRateLimiter().check({
    identifier: `merchant-push:${userId}`,
    ...RATE_LIMITS.merchantPush,
    strict: isDeployedRuntime(),
  });
  if (result.unavailable || !result.allowed) {
    throw new RateLimitError('Muitas alteraÃ§Ãµes de notificaÃ§Ã£o. Aguarde um minuto.');
  }
}

function privateError(error: unknown) {
  const response = errorToResponse(error);
  response.headers.set('Cache-Control', PRIVATE_HEADERS['Cache-Control']);
  return response;
}

export async function GET(request: Request) {
  try {
    if (!enabled()) throw new NotFoundError('Recurso');
    const active = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    await assertRateLimit(active.session.userId);
    const parsed = querySchema.safeParse({
      endpointHash: new URL(request.url).searchParams.get('endpointHash') ?? undefined,
    });
    if (!parsed.success || !parsed.data.endpointHash) {
      return Response.json({ enabled: false, badgeCount: 0 }, { headers: PRIVATE_HEADERS });
    }
    const state = await getStoreStaffPushSubscriptionState(
      contextFrom(active),
      parsed.data.endpointHash,
    );
    return Response.json(state, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return privateError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!enabled()) throw new NotFoundError('Recurso');
    const origin = assertMutationRequest(request);
    const active = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    await assertRateLimit(active.session.userId);
    const body = webPushSubscriptionInputSchema.safeParse(await readLimitedJson(request));
    if (!body.success) throw new ValidationError('InscriÃ§Ã£o Push invÃ¡lida.');
    const result = await enableStoreStaffPushSubscription({
      context: contextFrom(active),
      origin,
      subscription: body.data,
      ipAddress: request.headers.get('cf-connecting-ip'),
      userAgent: request.headers.get('user-agent'),
    });
    if (!result) throw new ValidationError('Origem da inscriÃ§Ã£o invÃ¡lida.');
    await setMerchantPushDeviceCookie(result.subscriptionId);
    return Response.json(
      { enabled: true, endpointHash: result.endpointHash },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return privateError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!enabled()) throw new NotFoundError('Recurso');
    assertMutationRequest(request);
    const active = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    await assertRateLimit(active.session.userId);
    const body = webPushDisableInputSchema.safeParse(await readLimitedJson(request));
    if (!body.success) throw new ValidationError('InscriÃ§Ã£o Push invÃ¡lida.');
    const result = await disableStoreStaffPushSubscription({
      context: contextFrom(active),
      endpointHash: body.data.endpointHash,
    });
    if (result.remaining === 0) await clearMerchantPushDeviceCookie();
    return Response.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return privateError(error);
  }
}
