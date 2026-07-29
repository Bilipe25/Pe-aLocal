import { cartQuoteSchema, checkoutQuoteSchema } from '@/schemas/checkout';
import { getDb } from '@/server/database/client';
import { CheckoutError, errorToResponse, NotFoundError, RateLimitError } from '@/server/errors';
import { getPublicStoreScopeBySlug } from '@/server/queries/public-store';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import {
  calculateCheckoutQuote,
  toPublicCheckoutQuote,
} from '@/server/services/checkout-quote.service';
import {
  getRecognitionCookieName,
  resolveRecognitionAddressReference,
  type ResolvedRecognitionAddress,
} from '@/server/services/customer-recognition.service';

export const dynamic = 'force-dynamic';

const MAX_CHECKOUT_QUOTE_BODY_BYTES = 256 * 1_024;

function payloadTooLarge() {
  return new CheckoutError('CART_INVALID', 'O carrinho enviado excede o limite permitido.', 413);
}

function assertDeclaredBodySize(request: Request) {
  const header = request.headers.get('content-length');
  if (header === null || !/^\d+$/.test(header.trim())) return;

  const declaredBytes = Number(header);
  if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_CHECKOUT_QUOTE_BODY_BYTES) {
    throw payloadTooLarge();
  }
}

async function readLimitedJsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new CheckoutError('CART_INVALID', 'O corpo da cotação deve ser um JSON válido.', 400);
  }

  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_CHECKOUT_QUOTE_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge();
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
    throw new CheckoutError('CART_INVALID', 'O corpo da cotação deve ser um JSON válido.', 400);
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
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value || null;
}

function deployedEnvironment() {
  return process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  const startedAt = performance.now();
  const correlationId = request.headers.get('cf-ray') ?? crypto.randomUUID();
  try {
    assertDeclaredBodySize(request);
    const { storeSlug } = await params;
    const rateLimit = await getRateLimiter().check({
      identifier: `checkout-quote:${storeSlug}:${clientAddress(request)}`,
      ...RATE_LIMITS.checkoutQuote,
      strict: deployedEnvironment(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError(
        'Não foi possível validar a cotação agora. Aguarde um instante e tente novamente.',
      );
    }
    if (!rateLimit.allowed) {
      throw new RateLimitError('Muitas atualizações do carrinho. Aguarde alguns segundos.');
    }

    const rawInput = await readLimitedJsonBody(request);
    const isCartPreview = new URL(request.url).searchParams.get('context') === 'cart';
    const parsed = (isCartPreview ? cartQuoteSchema : checkoutQuoteSchema).safeParse(rawInput);
    if (!parsed.success) {
      throw new CheckoutError(
        'CART_INVALID',
        'Revise os itens antes de calcular o pedido.',
        400,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    let savedAddress: ResolvedRecognitionAddress | null = null;
    if (parsed.data.savedAddressReference) {
      const scope = await getPublicStoreScopeBySlug(storeSlug);
      if (!scope) throw new NotFoundError('Loja');
      const browserToken = readCookie(request, getRecognitionCookieName());
      savedAddress = browserToken
        ? await resolveRecognitionAddressReference({
            tenantId: scope.tenantId,
            storeId: scope.id,
            browserToken,
            opaqueReference: parsed.data.savedAddressReference,
            client: getDb(),
          })
        : null;
    }

    const quote = await calculateCheckoutQuote(storeSlug, parsed.data, {
      savedAddress: savedAddress
        ? { ...savedAddress.address, mappedDeliveryZoneId: savedAddress.mappedDeliveryZoneId }
        : null,
    });
    if (!quote) throw new NotFoundError('Loja');

    const durationMs = Math.round(performance.now() - startedAt);
    console.info(
      JSON.stringify({
        event: 'checkout_quote_completed',
        correlationId,
        storeId: quote.storeId,
        durationMs,
        issueCodes: quote.issues.map((issue) => issue.code),
      }),
    );
    return Response.json(toPublicCheckoutQuote(quote), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Server-Timing': `checkout-quote;dur=${durationMs}`,
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
