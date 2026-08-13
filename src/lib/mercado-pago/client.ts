import 'server-only';

import type { z } from 'zod';

import { MERCADO_LIBRE_API_ORIGIN, MERCADO_PAGO_API_ORIGIN } from './config';
import {
  mercadoPagoCreatedOrderSchema,
  mercadoPagoOAuthTokenSchema,
  mercadoPagoOrderSchema,
  mercadoPagoOrderSearchSchema,
  mercadoPagoSellerProfileSchema,
} from './schemas';

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
    readonly validationIssues: ReadonlyArray<{ path: string; code: string }> = [],
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }
}

const SAFE_PROVIDER_CODE = /^[A-Za-z0-9_.-]{1,64}$/u;
const SAFE_PROVIDER_PATH = /^[A-Za-z0-9_.\[\]-]{1,160}$/u;

function providerErrorMetadata(payload: unknown, status: number) {
  const rootRecords: Record<string, unknown>[] = [];
  const detailRecords: Record<string, unknown>[] = [];
  if (typeof payload === 'object' && payload !== null) {
    rootRecords.push(payload as Record<string, unknown>);
    for (const key of ['errors', 'cause', 'details'] as const) {
      const entries = (payload as Record<string, unknown>)[key];
      if (Array.isArray(entries)) {
        detailRecords.push(
          ...entries.filter(
            (entry): entry is Record<string, unknown> =>
              typeof entry === 'object' && entry !== null,
          ),
        );
      }
    }
  }

  // A Orders API costuma envolver a causa específica (por exemplo,
  // `unsupported_properties`) em um erro genérico como
  // `unprocessable_content`. O código acionável dos detalhes deve vencer o
  // envelope, sem persistirmos mensagens ou o payload bruto do provedor.
  const code = [...detailRecords, ...rootRecords]
    .flatMap((record) => [record.code, record.error])
    .find((value): value is string => typeof value === 'string' && SAFE_PROVIDER_CODE.test(value));
  const validationIssues = detailRecords
    .flatMap((record) => {
      const issueCode =
        typeof record.code === 'string' && SAFE_PROVIDER_CODE.test(record.code)
          ? record.code
          : null;
      const pathCandidate = record.path ?? record.field ?? record.property;
      const path =
        typeof pathCandidate === 'string' && SAFE_PROVIDER_PATH.test(pathCandidate)
          ? pathCandidate
          : null;
      return issueCode && path ? [{ code: issueCode, path }] : [];
    })
    .slice(0, 8);

  return { code: code ?? `HTTP_${status}`, validationIssues };
}

async function requestJson<T>(input: {
  path: string;
  method: 'GET' | 'POST';
  accessToken?: string;
  idempotencyKey?: string;
  body?: unknown;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  origin?: typeof MERCADO_PAGO_API_ORIGIN | typeof MERCADO_LIBRE_API_ORIGIN;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8_000);
  try {
    const response = await fetch(`${input.origin ?? MERCADO_PAGO_API_ORIGIN}${input.path}`, {
      method: input.method,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
        ...(input.idempotencyKey ? { 'X-Idempotency-Key': input.idempotencyKey } : {}),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const metadata = providerErrorMetadata(payload, response.status);
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
      throw new MercadoPagoApiError(
        'O Mercado Pago recusou a operação.',
        response.status,
        metadata.code,
        Number.isFinite(retryAfter) ? retryAfter : null,
        metadata.validationIssues,
      );
    }
    const parsed = input.schema.safeParse(payload);
    if (!parsed.success) {
      throw new MercadoPagoApiError(
        'Resposta inválida do Mercado Pago.',
        502,
        'INVALID_RESPONSE',
        null,
        parsed.error.issues.slice(0, 8).map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join('.') : '$',
          code: issue.code,
        })),
      );
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

export function getMercadoPagoSellerProfile(input: { accessToken: string }) {
  return requestJson({
    origin: MERCADO_LIBRE_API_ORIGIN,
    path: '/users/me',
    method: 'GET',
    accessToken: input.accessToken,
    schema: mercadoPagoSellerProfileSchema,
  });
}

export function exchangeMercadoPagoAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}) {
  return requestJson({
    path: '/oauth/token',
    method: 'POST',
    body: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    },
    schema: mercadoPagoOAuthTokenSchema,
  });
}

export function refreshMercadoPagoToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return requestJson({
    path: '/oauth/token',
    method: 'POST',
    body: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    },
    schema: mercadoPagoOAuthTokenSchema,
  });
}

export function createMercadoPagoPixOrder(input: {
  accessToken: string;
  idempotencyKey: string;
  totalAmount: string;
  externalReference: string;
  payerEmail: string;
  payerFirstName?: string;
  expiration: string;
}) {
  return requestJson({
    path: '/v1/orders',
    method: 'POST',
    accessToken: input.accessToken,
    idempotencyKey: input.idempotencyKey,
    body: {
      type: 'online',
      total_amount: input.totalAmount,
      external_reference: input.externalReference,
      processing_mode: 'automatic',
      transactions: {
        payments: [
          {
            amount: input.totalAmount,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: input.expiration,
          },
        ],
      },
      payer: {
        email: input.payerEmail,
        ...(input.payerFirstName ? { first_name: input.payerFirstName } : {}),
      },
    },
    schema: mercadoPagoCreatedOrderSchema,
  });
}

export function searchMercadoPagoOrders(input: {
  accessToken: string;
  externalReference: string;
  beginDate: Date;
  endDate: Date;
}) {
  const query = new URLSearchParams({
    external_reference: input.externalReference,
    begin_date: input.beginDate.toISOString(),
    end_date: input.endDate.toISOString(),
    type: 'online',
    page: '1',
    page_size: '2',
    sort_by: 'created_date',
    sort_order: 'desc',
  });
  return requestJson({
    path: `/v1/orders?${query.toString()}`,
    method: 'GET',
    accessToken: input.accessToken,
    schema: mercadoPagoOrderSearchSchema,
  });
}

export function getMercadoPagoOrder(input: { accessToken: string; orderId: string }) {
  return requestJson({
    path: `/v1/orders/${encodeURIComponent(input.orderId)}`,
    method: 'GET',
    accessToken: input.accessToken,
    schema: mercadoPagoOrderSchema,
  });
}
