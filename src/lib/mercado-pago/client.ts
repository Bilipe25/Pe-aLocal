import 'server-only';

import type { z } from 'zod';

import { MERCADO_PAGO_API_ORIGIN } from './config';
import {
  mercadoPagoCreatedOrderSchema,
  mercadoPagoOAuthTokenSchema,
  mercadoPagoOrderSchema,
  mercadoPagoOrderSearchSchema,
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

async function requestJson<T>(input: {
  path: string;
  method: 'GET' | 'POST';
  accessToken?: string;
  idempotencyKey?: string;
  body?: unknown;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8_000);
  try {
    const response = await fetch(`${MERCADO_PAGO_API_ORIGIN}${input.path}`, {
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
      const code =
        typeof payload === 'object' &&
        payload &&
        'code' in payload &&
        typeof payload.code === 'string'
          ? payload.code
          : `HTTP_${response.status}`;
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
      throw new MercadoPagoApiError(
        'O Mercado Pago recusou a operação.',
        response.status,
        code.slice(0, 64),
        Number.isFinite(retryAfter) ? retryAfter : null,
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
  expiration: string;
}) {
  return requestJson({
    path: '/v1/orders',
    method: 'POST',
    accessToken: input.accessToken,
    idempotencyKey: input.idempotencyKey,
    body: {
      type: 'online',
      currency: 'BRL',
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
      payer: { email: input.payerEmail },
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
