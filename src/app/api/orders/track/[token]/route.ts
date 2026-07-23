import { z } from 'zod';

import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
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

    const clientAddress =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown';
    const rateLimit = await getRateLimiter().check({
      identifier: `tracking:${clientAddress}:${parsed.data.token}`,
      ...RATE_LIMITS.publicOrderLookup,
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError('Muitas atualizações em sequência. Aguarde um minuto.');
    }

    const state = await getCustomerOrderTrackingState(parsed.data.token, parsed.data.storeSlug);
    if (!state) throw new NotFoundError('Pedido');

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
