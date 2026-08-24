import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  getMercadoPagoConfig,
  getMercadoPagoWebhookApplicationId,
} from '@/lib/mercado-pago/config';
import {
  mercadoPagoExpandedOrderWebhookSchema,
  mercadoPagoWebhookSchema,
  mercadoPagoWebhookUrlValidationProbeSchema,
} from '@/lib/mercado-pago/schemas';
import { verifyMercadoPagoSignature } from '@/lib/mercado-pago/signature';
import { enqueueMercadoPagoWebhook } from '@/server/services/mercado-pago-webhook.service';

const MAX_WEBHOOK_BYTES = 64 * 1024;

function response(status: number) {
  return NextResponse.json(
    { received: status < 400 },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function wakePaymentWorker(eventId: string) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const worker = (env as CloudflareEnv & { ORDER_EVENTS_WORKER?: Fetcher }).ORDER_EVENTS_WORKER;
    if (!worker) return;
    const wake = await worker.fetch('https://order-events.internal/internal/mercado-pago/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    if (!wake.ok) console.warn('[MP_WEBHOOK_WAKE_REJECTED]', { status: wake.status });
  } catch {
    console.warn('[MP_WEBHOOK_WAKE_UNAVAILABLE]');
  }
}

async function expandedWebhookEventId(input: {
  action: string;
  applicationId: string;
  dateCreated: string;
  objectId: string;
  userId: string;
}) {
  const identity = [
    input.applicationId,
    input.userId,
    input.action,
    input.objectId,
    input.dateCreated,
  ].join(':');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `expanded_${hash}`;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) return response(413);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) return response(413);

  const dataId = new URL(request.url).searchParams.get('data.id');
  let config;
  let webhookApplicationId: string;
  try {
    config = getMercadoPagoConfig();
    webhookApplicationId = getMercadoPagoWebhookApplicationId(config);
  } catch {
    return response(503);
  }
  const signatureVerification = await verifyMercadoPagoSignature({
    signature: request.headers.get('x-signature'),
    requestId: request.headers.get('x-request-id'),
    dataId,
    secret: config.webhookSecret,
  });
  if (!signatureVerification.valid) {
    console.warn('[MP_WEBHOOK_INVALID_SIGNATURE]', { reason: signatureVerification.reason });
    return response(401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return response(400);
  }
  const parsed = mercadoPagoWebhookSchema.safeParse(payload);
  let event;
  if (parsed.success) {
    event = parsed.data;
  } else {
    const expanded = mercadoPagoExpandedOrderWebhookSchema.safeParse(payload);
    if (!expanded.success) {
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
    event = {
      id:
        expanded.data.id ??
        (await expandedWebhookEventId({
          action: expanded.data.action,
          applicationId: expanded.data.application_id,
          dateCreated: expanded.data.date_created,
          objectId: expanded.data.data.id,
          userId: expanded.data.user_id,
        })),
      action: expanded.data.action,
      api_version: expanded.data.api_version,
      application_id: expanded.data.application_id,
      data: { id: expanded.data.data.id },
      date_created: expanded.data.date_created,
      live_mode: expanded.data.live_mode,
      type: expanded.data.type,
      user_id: expanded.data.user_id,
    };
  }
  if (event.data.id !== dataId) return response(400);
  const expectedLiveMode = config.oauthEnvironment === 'production';
  if (event.live_mode !== expectedLiveMode) {
    console.warn('[MP_WEBHOOK_ENVIRONMENT_MISMATCH]');
    return response(400);
  }
  if (event.application_id !== webhookApplicationId) {
    console.warn('[MP_WEBHOOK_APPLICATION_MISMATCH]');
    return response(400);
  }

  try {
    const persisted = await enqueueMercadoPagoWebhook(event);
    if (!persisted.processedAt) await wakePaymentWorker(persisted.id);
    return response(200);
  } catch (error) {
    console.error('[MP_WEBHOOK_FAILED]', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    });
    return response(503);
  }
}
