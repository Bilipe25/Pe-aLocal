import { z } from 'zod';

import { isWebPushEnabled } from '@/lib/web-push/config';
import {
  webPushAssociationQuerySchema,
  webPushDisableInputSchema,
  webPushSubscriptionInputSchema,
} from '@/schemas/web-push';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import {
  getPublicClientAddress,
  hashPublicRateLimitValue,
} from '@/server/rate-limit/public-identifiers';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  disableOrderPushSubscription,
  enableOrderPushSubscription,
  getOrderPushSubscriptionState,
} from '@/server/services/web-push-subscription.service';

const tokenSchema = z.string().uuid();
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function responseError(error: unknown) {
  const response = errorToResponse(error);
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value);
  return response;
}

function assertMutationRequest(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new ValidationError('Requisição inválida.');
  const origin = request.headers.get('origin');
  if (
    (isDeployedRuntime() && !origin) ||
    (origin && new URL(origin).origin !== new URL(request.url).origin)
  ) {
    throw new ValidationError('Origem inválida.');
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ValidationError('Conteúdo inválido.');
  }
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 8_192) throw new ValidationError('Conteúdo muito grande.');
  return origin ?? new URL(request.url).origin;
}

async function readLimitedJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 8_192) {
    throw new ValidationError('Conteúdo muito grande.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError('Conteúdo inválido.');
  }
}

async function assertRateLimit(request: Request, token: string) {
  const [clientKey, tokenKey] = await Promise.all([
    hashPublicRateLimitValue('tracking-push-ip', getPublicClientAddress(request)),
    hashPublicRateLimitValue('tracking-push-token', token),
  ]);
  const limiter = getRateLimiter();
  const [byIp, byToken] = await Promise.all([
    limiter.check({
      identifier: `tracking-push-ip:${clientKey}`,
      ...RATE_LIMITS.publicOrderPushByIp,
      strict: isDeployedRuntime(),
    }),
    limiter.check({
      identifier: `tracking-push-token:${tokenKey}`,
      ...RATE_LIMITS.publicOrderPushByToken,
      strict: isDeployedRuntime(),
    }),
  ]);
  if (byIp.unavailable || byToken.unavailable || !byIp.allowed || !byToken.allowed) {
    throw new RateLimitError('Muitas alterações de notificação. Aguarde um minuto.');
  }
}

function parseRequest(request: Request, token: string) {
  const url = new URL(request.url);
  const parsedToken = tokenSchema.safeParse(token);
  const parsedQuery = webPushAssociationQuerySchema.safeParse({
    storeSlug: url.searchParams.get('storeSlug'),
    endpointHash: url.searchParams.get('endpointHash') ?? undefined,
  });
  if (!parsedToken.success || !parsedQuery.success)
    throw new ValidationError('Acompanhamento inválido.');
  return { token: parsedToken.data, ...parsedQuery.data };
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const parsed = parseRequest(request, (await params).token);
    if (!isWebPushEnabled() || !parsed.endpointHash)
      return Response.json({ enabled: false }, { headers: PRIVATE_HEADERS });
    await assertRateLimit(request, parsed.token);
    const state = await getOrderPushSubscriptionState({
      publicToken: parsed.token,
      storeSlug: parsed.storeSlug,
      endpointHash: parsed.endpointHash,
    });
    if (!state) throw new NotFoundError('Pedido');
    return Response.json({ enabled: state.enabled }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!isWebPushEnabled()) throw new NotFoundError('Recurso');
    const parsed = parseRequest(request, (await params).token);
    const origin = assertMutationRequest(request);
    await assertRateLimit(request, parsed.token);
    const body = webPushSubscriptionInputSchema.safeParse(await readLimitedJson(request));
    if (!body.success) throw new ValidationError('Inscrição Push inválida.');
    const result = await enableOrderPushSubscription({
      publicToken: parsed.token,
      storeSlug: parsed.storeSlug,
      origin,
      subscription: body.data,
    });
    if (!result) throw new NotFoundError('Pedido');
    return Response.json({ enabled: true }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!isWebPushEnabled()) throw new NotFoundError('Recurso');
    const parsed = parseRequest(request, (await params).token);
    assertMutationRequest(request);
    await assertRateLimit(request, parsed.token);
    const body = webPushDisableInputSchema.safeParse(await readLimitedJson(request));
    if (!body.success) throw new ValidationError('Inscrição Push inválida.');
    const result = await disableOrderPushSubscription({
      publicToken: parsed.token,
      storeSlug: parsed.storeSlug,
      endpointHash: body.data.endpointHash,
    });
    if (!result) throw new NotFoundError('Pedido');
    return Response.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return responseError(error);
  }
}
