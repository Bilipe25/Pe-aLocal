import { NextResponse } from 'next/server';
import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { getCustomerOrderDetails } from '@/server/services/customer-order-tracking.service';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({ token: z.uuid(), storeSlug: slugSchema }).strict();

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

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const storeSlug = new URL(request.url).searchParams.get('storeSlug');
    const parsed = requestSchema.safeParse({ token, storeSlug });
    if (!parsed.success) throw new ValidationError('O pedido informado é inválido.');

    const rateLimit = await getRateLimiter().check({
      identifier: `order-details:${parsed.data.storeSlug}:${clientAddress(request)}`,
      ...RATE_LIMITS.storefrontRecommendations,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError('Não foi possível carregar este pedido agora. Tente novamente.');
    }
    if (!rateLimit.allowed) throw new RateLimitError('Muitas tentativas. Aguarde alguns segundos.');

    const details = await getCustomerOrderDetails(parsed.data.token, parsed.data.storeSlug);
    if (!details) throw new NotFoundError('Pedido');
    return NextResponse.json(details, { headers: securityHeaders });
  } catch (error) {
    const response = errorToResponse(error);
    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  }
}
