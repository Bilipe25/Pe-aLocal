import { NextResponse } from 'next/server';

import { getMercadoPagoConfig } from '@/lib/mercado-pago/config';
import {
  mercadoPagoWebhookSchema,
  mercadoPagoWebhookUrlValidationProbeSchema,
} from '@/lib/mercado-pago/schemas';
import { validateMercadoPagoSignature } from '@/lib/mercado-pago/signature';
import { enqueueMercadoPagoWebhook } from '@/server/services/mercado-pago-webhook.service';

const MAX_WEBHOOK_BYTES = 64 * 1024;

function response(status: number) {
  return NextResponse.json(
    { received: status < 400 },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) return response(413);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) return response(413);

  const dataId = new URL(request.url).searchParams.get('data.id');
  let config;
  try {
    config = getMercadoPagoConfig();
  } catch {
    return response(503);
  }
  const validSignature = await validateMercadoPagoSignature({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
    secret: config.webhookSecret,
  });
  if (!validSignature) {
    console.warn('[MP_WEBHOOK_INVALID_SIGNATURE]');
    return response(401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return response(400);
  }
  const parsed = mercadoPagoWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    const validationProbe = mercadoPagoWebhookUrlValidationProbeSchema.safeParse(payload);
    if (
      !validationProbe.success ||
      validationProbe.data.application_id !== config.clientId ||
      validationProbe.data.data.id !== dataId
    ) {
      return response(400);
    }

    console.info('[MP_WEBHOOK_URL_VALIDATION_ACCEPTED]');
    return response(200);
  }
  if (parsed.data.data.id !== dataId) return response(400);
  if (parsed.data.application_id !== config.clientId) {
    console.warn('[MP_WEBHOOK_APPLICATION_MISMATCH]');
    return response(400);
  }

  try {
    await enqueueMercadoPagoWebhook(parsed.data);
    return response(200);
  } catch (error) {
    console.error('[MP_WEBHOOK_FAILED]', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
    return response(503);
  }
}
