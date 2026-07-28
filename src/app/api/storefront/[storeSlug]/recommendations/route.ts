import { z } from 'zod';

import {
  MAX_VISIBLE_CART_RECOMMENDATIONS,
  rankCartRecommendationPool,
  selectCartRecommendations,
} from '@/features/storefront/cart-recommendations';
import { slugSchema } from '@/schemas/store';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import {
  getPublicCartRecommendationCandidates,
  getPublicStoreScopeBySlug,
} from '@/server/queries/public-store';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { getEffectiveStoreAvailabilityForTenant } from '@/server/services/store-availability.service';

export const dynamic = 'force-dynamic';

const MAX_RECOMMENDATION_BODY_BYTES = 4 * 1_024;

const recommendationParamsSchema = z.object({ storeSlug: slugSchema }).strict();
const recommendationRequestSchema = z
  .object({
    productIds: z.array(z.guid()).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.productIds).size !== value.productIds.length) {
      context.addIssue({ code: 'custom', path: ['productIds'], message: 'Produtos duplicados.' });
    }
  });

const securityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

function invalidRequest() {
  return new ValidationError('Os itens do carrinho são inválidos.');
}

function assertDeclaredBodySize(request: Request) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength === null || !/^\d+$/.test(declaredLength.trim())) return;

  const declaredBytes = Number(declaredLength);
  if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_RECOMMENDATION_BODY_BYTES) {
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
      if (receivedBytes > MAX_RECOMMENDATION_BODY_BYTES) {
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

function deployedEnvironment() {
  return (
    process.env.NODE_ENV === 'production' &&
    (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production')
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  try {
    assertDeclaredBodySize(request);
    const parsedParams = recommendationParamsSchema.safeParse(await params);
    if (!parsedParams.success) throw invalidRequest();

    const parsedBody = recommendationRequestSchema.safeParse(await readLimitedJsonBody(request));
    if (!parsedBody.success) throw invalidRequest();

    const store = await getPublicStoreScopeBySlug(parsedParams.data.storeSlug);
    if (!store) throw new NotFoundError('Loja');

    const rateLimit = await getRateLimiter().check({
      identifier: `recommendation:${store.id}:${clientAddress(request)}`,
      ...RATE_LIMITS.storefrontRecommendations,
      strict: deployedEnvironment(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError(
        'Não foi possível carregar as sugestões agora. Aguarde um instante e tente novamente.',
      );
    }
    if (!rateLimit.allowed) {
      throw new RateLimitError('Muitas atualizações da sacola. Aguarde alguns segundos.');
    }

    const availability = await getEffectiveStoreAvailabilityForTenant(store.tenantId, store.id);
    if (!availability.acceptingOrders) {
      return Response.json({ recommendations: [] }, { headers: securityHeaders });
    }

    const candidates = await getPublicCartRecommendationCandidates(store.id, store.tenantId);
    const ranked = rankCartRecommendationPool(candidates, candidates.length);
    const recommendations = selectCartRecommendations(
      ranked,
      parsedBody.data.productIds,
      MAX_VISIBLE_CART_RECOMMENDATIONS,
    );

    return Response.json({ recommendations }, { headers: securityHeaders });
  } catch (error) {
    const response = errorToResponse(error);
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  }
}
