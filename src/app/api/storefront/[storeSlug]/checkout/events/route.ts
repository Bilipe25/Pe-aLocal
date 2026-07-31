import { z } from 'zod';

import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { getPublicStoreScopeBySlug } from '@/server/queries/public-store';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';

export const dynamic = 'force-dynamic';

const MAX_CHECKOUT_TELEMETRY_BODY_BYTES = 2 * 1_024;

const checkoutTelemetrySchema = z
  .object({
    event: z.enum([
      'checkout_started',
      'checkout_step_viewed',
      'checkout_abandoned',
      'checkout_quote_changed',
      'checkout_completed',
      'recommendation_viewed',
      'recommendation_clicked',
      'recommendation_added',
      'recent_purchases_section_viewed',
      'recent_purchase_product_clicked',
      'recent_purchase_product_added',
      'featured_section_viewed',
      'featured_product_clicked',
    ]),
    step: z.enum(['identification', 'fulfillment', 'payment', 'review']).optional(),
    reason: z.enum(['navigation', 'page_hidden', 'quote_changed']).optional(),
    productId: z.guid().optional(),
    position: z.number().int().min(0).max(20).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const recommendationEvent =
      value.event.startsWith('recommendation_') ||
      value.event.startsWith('recent_purchase') ||
      value.event.startsWith('featured_');
    const productEvent =
      value.event === 'recommendation_clicked' ||
      value.event === 'recommendation_added' ||
      value.event === 'recent_purchase_product_clicked' ||
      value.event === 'recent_purchase_product_added' ||
      value.event === 'featured_product_clicked';

    if (recommendationEvent && (value.step || value.reason)) {
      context.addIssue({ code: 'custom', message: 'Contexto incompatível com recomendação.' });
    }
    if (productEvent && !value.productId) {
      context.addIssue({ code: 'custom', path: ['productId'], message: 'Produto obrigatório.' });
    }
    if (!productEvent && value.productId) {
      context.addIssue({ code: 'custom', path: ['productId'], message: 'Produto não permitido.' });
    }
    if (!productEvent && value.position !== undefined) {
      context.addIssue({ code: 'custom', path: ['position'], message: 'Posição não permitida.' });
    }
  });

function invalidTelemetryPayload() {
  return new ValidationError('O evento informado é inválido.');
}

function assertDeclaredBodySize(request: Request) {
  const header = request.headers.get('content-length');
  if (header === null || !/^\d+$/.test(header.trim())) return;

  const declaredBytes = Number(header);
  if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_CHECKOUT_TELEMETRY_BODY_BYTES) {
    throw invalidTelemetryPayload();
  }
}

async function readLimitedJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw invalidTelemetryPayload();

  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_CHECKOUT_TELEMETRY_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidTelemetryPayload();
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
    throw invalidTelemetryPayload();
  }
}

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  const correlationId = request.headers.get('cf-ray') ?? crypto.randomUUID();
  try {
    assertDeclaredBodySize(request);

    const { storeSlug } = await params;
    const store = await getPublicStoreScopeBySlug(storeSlug);
    if (!store) throw new NotFoundError('Loja');

    const rateLimit = await getRateLimiter().check({
      identifier: `checkout-event:${store.id}:${clientAddress(request)}`,
      ...RATE_LIMITS.checkoutQuote,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable || !rateLimit.allowed) {
      throw new RateLimitError();
    }

    const parsed = checkoutTelemetrySchema.safeParse(await readLimitedJsonBody(request));
    if (!parsed.success) {
      throw invalidTelemetryPayload();
    }

    const recommendationEvent =
      parsed.data.event.startsWith('recommendation_') ||
      parsed.data.event.startsWith('recent_purchase') ||
      parsed.data.event.startsWith('featured_');
    console.info(
      JSON.stringify(
        recommendationEvent
          ? {
              event: 'storefront_recommendation_event',
              correlationId,
              storeId: store.id,
              recommendationEvent: parsed.data.event,
              productId: parsed.data.productId ?? null,
              ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
            }
          : {
              event: 'checkout_funnel_event',
              correlationId,
              storeId: store.id,
              funnelEvent: parsed.data.event,
              step: parsed.data.step ?? null,
              reason: parsed.data.reason ?? null,
            },
      ),
    );

    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Correlation-Id': correlationId,
      },
    });
  } catch (error) {
    const response = errorToResponse(error);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('X-Correlation-Id', correlationId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
