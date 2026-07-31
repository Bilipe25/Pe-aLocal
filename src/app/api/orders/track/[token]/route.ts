import { z } from 'zod';

import {
  errorToResponse,
  NotFoundError,
  PublicTokenExpiredError,
  RateLimitError,
  ValidationError,
} from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import {
  getPublicClientAddress,
  hashPublicRateLimitValue,
} from '@/server/rate-limit/public-identifiers';
import { isPublicOrderTokenExpired } from '@/server/repositories/order.repository';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { getCustomerOrderTrackingState } from '@/server/services/customer-order-tracking.service';

const trackingRequestSchema = z.object({
  token: z.string().uuid(),
  storeSlug: z.string().trim().min(1).max(120),
});

function privateErrorResponse(error: unknown) {
  const response = errorToResponse(error);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const parsed = trackingRequestSchema.safeParse({
      token,
      storeSlug: new URL(request.url).searchParams.get('storeSlug'),
    });
    if (!parsed.success) throw new ValidationError('O acompanhamento informado é inválido.');

    const [clientKey, tokenKey] = await Promise.all([
      hashPublicRateLimitValue('tracking-lookup-ip', getPublicClientAddress(request)),
      hashPublicRateLimitValue('tracking-lookup-token', parsed.data.token),
    ]);
    const limiter = getRateLimiter();
    const [ipRateLimit, tokenRateLimit] = await Promise.all([
      limiter.check({
        identifier: `tracking-lookup-ip:${clientKey}`,
        ...RATE_LIMITS.publicOrderLookupByIp,
        strict: isDeployedRuntime(),
      }),
      limiter.check({
        identifier: `tracking-lookup-token:${tokenKey}`,
        ...RATE_LIMITS.publicOrderLookupByToken,
        strict: isDeployedRuntime(),
      }),
    ]);
    if (
      ipRateLimit.unavailable ||
      tokenRateLimit.unavailable ||
      !ipRateLimit.allowed ||
      !tokenRateLimit.allowed
    ) {
      throw new RateLimitError('Muitas atualizações em sequência. Aguarde um minuto.');
    }

    const state = await getCustomerOrderTrackingState(parsed.data.token, parsed.data.storeSlug);
    if (!state) {
      if (await isPublicOrderTokenExpired(parsed.data.token, parsed.data.storeSlug)) {
        throw new PublicTokenExpiredError();
      }
      throw new NotFoundError('Pedido');
    }

    return Response.json(state, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return privateErrorResponse(error);
  }
}
