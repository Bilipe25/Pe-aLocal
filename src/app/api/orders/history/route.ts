import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, RateLimitError, ValidationError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { getCustomerOrderTrackingStates } from '@/server/services/customer-order-tracking.service';

export const dynamic = 'force-dynamic';

const requestSchema = z
  .object({ storeSlug: slugSchema, trackingTokens: z.array(z.uuid()).min(1).max(5) })
  .strict()
  .refine((value) => new Set(value.trackingTokens).size === value.trackingTokens.length);

const securityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ValidationError('Os pedidos informados são inválidos.');
    const rateLimit = await getRateLimiter().check({
      identifier: `order-history:${parsed.data.storeSlug}:${clientAddress(request)}`,
      ...RATE_LIMITS.storefrontRecommendations,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError('Não foi possível atualizar os pedidos agora. Tente novamente.');
    }
    if (!rateLimit.allowed)
      throw new RateLimitError('Muitas atualizações. Aguarde alguns segundos.');

    const orders = await getCustomerOrderTrackingStates(
      parsed.data.trackingTokens,
      parsed.data.storeSlug,
    );
    return Response.json({ orders }, { headers: securityHeaders });
  } catch (error) {
    const response = errorToResponse(error);
    for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
    return response;
  }
}
