import { diningTableTokenFingerprint } from '@/domain/dining-tables';
import { dineInCheckoutQuoteSchema } from '@/schemas/checkout';
import { CheckoutError, errorToResponse, NotFoundError, RateLimitError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  calculateCheckoutQuote,
  toPublicCheckoutQuote,
} from '@/server/services/checkout-quote.service';
import { resolveDiningTableContext } from '@/server/services/dining-table.service';

export const dynamic = 'force-dynamic';

const MAX_CHECKOUT_QUOTE_BODY_BYTES = 256 * 1_024;

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function readLimitedJsonBody(request: Request) {
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_CHECKOUT_QUOTE_BODY_BYTES) {
    throw new CheckoutError('CART_INVALID', 'O carrinho enviado excede o limite permitido.', 413);
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_CHECKOUT_QUOTE_BODY_BYTES) {
    throw new CheckoutError('CART_INVALID', 'O carrinho enviado excede o limite permitido.', 413);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CheckoutError('CART_INVALID', 'O corpo da cotação deve ser um JSON válido.', 400);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tableToken: string }> },
) {
  const correlationId = request.headers.get('cf-ray') ?? crypto.randomUUID();
  try {
    const { tableToken } = await params;
    const rateLimit = await getRateLimiter().check({
      identifier: `dine-in-quote:${diningTableTokenFingerprint(tableToken)}:${clientAddress(request)}`,
      ...RATE_LIMITS.checkoutQuote,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError('Não foi possível validar o pedido agora. Tente novamente.');
    }
    if (!rateLimit.allowed) {
      throw new RateLimitError('Muitas atualizações do pedido. Aguarde alguns segundos.');
    }

    const table = await resolveDiningTableContext(tableToken);
    if (!table) throw new NotFoundError('QR Code');
    const rawInput = await readLimitedJsonBody(request);
    const parsed = dineInCheckoutQuoteSchema.safeParse(rawInput);
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

    const quote = await calculateCheckoutQuote(
      table.store.slug,
      { ...parsed.data, modality: 'DINE_IN' },
      {
        diningTable: {
          id: table.id,
          tenantId: table.tenantId,
          storeId: table.storeId,
          label: table.label,
          version: table.version,
          isActive: table.isActive,
        },
      },
    );
    if (!quote) throw new NotFoundError('Loja');

    return Response.json(toPublicCheckoutQuote(quote), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, private, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Correlation-Id': correlationId,
      },
    });
  } catch (error) {
    const response = errorToResponse(error);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, private, max-age=0');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Correlation-Id', correlationId);
    return new Response(response.body, { status: response.status, headers });
  }
}
