import { z } from 'zod';

import {
  customerRecognitionInputSchema,
  customerRecognitionPatchSchema,
} from '@/schemas/customer-recognition';
import { slugSchema } from '@/schemas/store';
import { errorToResponse, NotFoundError, ValidationError } from '@/server/errors';
import { getPublicStoreScopeBySlug } from '@/server/queries/public-store';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  confirmRecognitionAddress,
  continueRecognitionWithNewAddress,
  getRecognitionCookieName,
  hashRecognitionSecret,
  invalidateRecognitionSession,
  RecognitionRateLimitError,
  startCustomerRecognition,
  startDeviceCustomerRecognition,
} from '@/server/services/customer-recognition.service';
import {
  getStorefrontDeviceCookieName,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';
import type { CustomerRecognitionResult } from '@/types/customer-recognition';

export const dynamic = 'force-dynamic';

const MAX_RECOGNITION_BODY_BYTES = 4 * 1_024;
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();
const genericUnavailableResult: CustomerRecognitionResult = {
  recognized: false,
  message:
    'O reconhecimento rápido está temporariamente indisponível. Continue preenchendo o checkout normalmente.',
  recognitionUnavailable: true,
};
const securityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const;

function invalidRequest(message = 'Os dados do reconhecimento são inválidos.') {
  return new ValidationError(message);
}

function assertTrustedOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw invalidRequest();
  const origin = request.headers.get('origin');
  if (!origin) {
    if (isDeployedRuntime()) throw invalidRequest();
    return;
  }

  try {
    if (new URL(origin).origin !== new URL(request.url).origin) throw invalidRequest();
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw invalidRequest();
  }
}

function assertJsonContentType(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw invalidRequest();
  }
}

function assertDeclaredBodySize(request: Request) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength === null || !/^\d+$/.test(declaredLength.trim())) return;
  const declaredBytes = Number(declaredLength);
  if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_RECOGNITION_BODY_BYTES) {
    throw invalidRequest();
  }
}

async function readLimitedJsonBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw invalidRequest();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RECOGNITION_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidRequest();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw invalidRequest();
  }
}

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;
  for (const item of cookies.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return item.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

function serializeRecognitionCookie(value: string, expiresAt: Date) {
  const secure = isDeployedRuntime() ? '; Secure' : '';
  const maxAge = Math.max(0, Math.min(900, Math.ceil((expiresAt.getTime() - Date.now()) / 1_000)));
  return `${getRecognitionCookieName()}=${value}; Path=/; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax${secure}`;
}

function clearRecognitionCookie() {
  const secure = isDeployedRuntime() ? '; Secure' : '';
  return `${getRecognitionCookieName()}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`;
}

function secureJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return Response.json(body, { ...init, headers });
}

function secureError(error: unknown) {
  if (error instanceof RecognitionRateLimitError) {
    return secureJson(
      { ...genericUnavailableResult, retryAfterSeconds: error.retryAfterSeconds },
      {
        status: 429,
        headers: { 'Retry-After': String(error.retryAfterSeconds) },
      },
    );
  }
  const response = errorToResponse(error);
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

async function readScope(context: { params: Promise<{ storeSlug: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) throw invalidRequest();
  const store = await getPublicStoreScopeBySlug(parsed.data.storeSlug);
  if (!store) throw new NotFoundError('Loja');
  return store;
}

async function nativeRateLimit(params: {
  tenantId: string;
  storeId: string;
  clientIp: string;
  phoneNormalized: string;
}) {
  const [ipHash, phoneHash] = await Promise.all([
    hashRecognitionSecret(`ip:${params.clientIp}`),
    hashRecognitionSecret(`phone:${params.phoneNormalized}`),
  ]);
  const limiter = getRateLimiter();
  const strict = isDeployedRuntime();
  const [storeResult, ipResult, phoneResult] = await Promise.all([
    limiter.check({
      identifier: `recognition-store:${params.storeId}`,
      ...RATE_LIMITS.customerRecognitionByStore,
      strict,
    }),
    limiter.check({
      identifier: `recognition-ip:${params.tenantId}:${ipHash}`,
      ...RATE_LIMITS.customerRecognitionByIp,
      strict,
    }),
    limiter.check({
      identifier: `recognition-phone:${params.tenantId}:${phoneHash}`,
      ...RATE_LIMITS.customerRecognitionByPhone,
      strict,
    }),
  ]);
  const results = [storeResult, ipResult, phoneResult];
  return {
    unavailable: results.some((result) => result.unavailable),
    allowed: results.every((result) => result.allowed),
    retryAfterSeconds: Math.max(
      1,
      ...results.map((result) => Math.ceil((result.resetAt - Date.now()) / 1_000)),
    ),
  };
}

async function nativeDeviceRateLimit(params: {
  tenantId: string;
  storeId: string;
  clientIp: string;
  deviceToken: string;
}) {
  const [ipHash, deviceHash] = await Promise.all([
    hashRecognitionSecret(`ip:${params.clientIp}`),
    hashRecognitionSecret(`device:${params.deviceToken}`),
  ]);
  const limiter = getRateLimiter();
  const strict = isDeployedRuntime();
  const [storeResult, ipResult, deviceResult] = await Promise.all([
    limiter.check({
      identifier: `recognition-store:${params.storeId}`,
      ...RATE_LIMITS.customerRecognitionByStore,
      strict,
    }),
    limiter.check({
      identifier: `recognition-ip:${params.tenantId}:${ipHash}`,
      ...RATE_LIMITS.customerRecognitionByIp,
      strict,
    }),
    limiter.check({
      identifier: `recognition-device:${params.tenantId}:${params.storeId}:${deviceHash}`,
      ...RATE_LIMITS.customerRecognitionByDevice,
      strict,
    }),
  ]);
  const results = [storeResult, ipResult, deviceResult];
  return {
    unavailable: results.some((result) => result.unavailable),
    allowed: results.every((result) => result.allowed),
  };
}

export async function GET(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw invalidRequest();
    const store = await readScope(context);
    const deviceToken = readCookie(request, getStorefrontDeviceCookieName());
    if (!isStorefrontDeviceToken(deviceToken)) {
      return secureJson({
        recognized: false,
        message: 'Continue informando seus dados para concluir o pedido.',
      } satisfies CustomerRecognitionResult);
    }

    const rateLimit = await nativeDeviceRateLimit({
      tenantId: store.tenantId,
      storeId: store.id,
      clientIp: clientAddress(request),
      deviceToken,
    });
    if (rateLimit.unavailable || !rateLimit.allowed) {
      return secureJson(genericUnavailableResult);
    }

    const recognition = await startDeviceCustomerRecognition({
      tenantId: store.tenantId,
      storeId: store.id,
      deviceToken,
      browserToken: readCookie(request, getRecognitionCookieName()),
    });
    if (!recognition) {
      return secureJson({
        recognized: false,
        message: 'Continue informando seus dados para concluir o pedido.',
      } satisfies CustomerRecognitionResult);
    }
    return secureJson(recognition.result, {
      headers: {
        'Set-Cookie': serializeRecognitionCookie(recognition.browserToken, recognition.expiresAt),
      },
    });
  } catch (error) {
    return secureError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertTrustedOrigin(request);
    assertJsonContentType(request);
    assertDeclaredBodySize(request);
    const parsedInput = customerRecognitionInputSchema.safeParse(
      await readLimitedJsonBody(request),
    );
    if (!parsedInput.success) throw invalidRequest();
    const store = await readScope(context);
    const ip = clientAddress(request);
    const rateLimit = await nativeRateLimit({
      tenantId: store.tenantId,
      storeId: store.id,
      clientIp: ip,
      phoneNormalized: parsedInput.data.customerPhone,
    });
    if (rateLimit.unavailable) {
      return secureJson(genericUnavailableResult, { status: 503 });
    }
    if (!rateLimit.allowed) {
      return secureJson(
        { ...genericUnavailableResult, retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const recognition = await startCustomerRecognition({
      tenantId: store.tenantId,
      storeId: store.id,
      input: parsedInput.data,
      browserToken: readCookie(request, getRecognitionCookieName()),
      clientIp: ip,
    });
    return secureJson(recognition.result, {
      headers: {
        'Set-Cookie': serializeRecognitionCookie(recognition.browserToken, recognition.expiresAt),
      },
    });
  } catch (error) {
    return secureError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertTrustedOrigin(request);
    assertJsonContentType(request);
    assertDeclaredBodySize(request);
    const parsedInput = customerRecognitionPatchSchema.safeParse(
      await readLimitedJsonBody(request),
    );
    if (!parsedInput.success) throw invalidRequest();
    const store = await readScope(context);
    const browserToken = readCookie(request, getRecognitionCookieName());
    if (!browserToken) {
      return secureJson(genericUnavailableResult, { status: 410 });
    }

    const result =
      parsedInput.data.action === 'CONFIRM_ADDRESS'
        ? await confirmRecognitionAddress({
            tenantId: store.tenantId,
            storeId: store.id,
            browserToken,
            opaqueReference: parsedInput.data.opaqueReference,
          })
        : await continueRecognitionWithNewAddress({
            tenantId: store.tenantId,
            storeId: store.id,
            browserToken,
          });
    if (!result) return secureJson(genericUnavailableResult, { status: 410 });
    return secureJson(result);
  } catch (error) {
    return secureError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ storeSlug: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const store = await readScope(context);
    const forgetDevice = new URL(request.url).searchParams.get('forgetDevice') === '1';
    const result = await invalidateRecognitionSession({
      tenantId: store.tenantId,
      storeId: store.id,
      browserToken: readCookie(request, getRecognitionCookieName()),
      deviceToken: forgetDevice ? readCookie(request, getStorefrontDeviceCookieName()) : null,
    });
    return secureJson(result, { headers: { 'Set-Cookie': clearRecognitionCookie() } });
  } catch (error) {
    return secureError(error);
  }
}
