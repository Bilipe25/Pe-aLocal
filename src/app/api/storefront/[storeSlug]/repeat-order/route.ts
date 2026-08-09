import { cookies } from 'next/headers';
import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { getPublicStoreScopeBySlug } from '@/server/queries/public-store';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { getStorefrontDeviceCookieName } from '@/server/services/customer-device-recognition.service';
import { prepareOrderRepeat } from '@/server/services/repeat-order.service';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ storeSlug: slugSchema }).strict();
const requestSchema = z
  .object({
    orderId: z.guid().optional(),
    trackingToken: z.uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.orderId) !== Boolean(value.trackingToken));

const headers = {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsedParams.success || !parsedBody.success) {
      throw new ValidationError('O pedido informado é inválido.');
    }

    const store = await getPublicStoreScopeBySlug(parsedParams.data.storeSlug);
    if (!store) throw new NotFoundError('Pedido');

    const rateLimit = await getRateLimiter().check({
      identifier: `repeat-order:${store.id}:${clientAddress(request)}`,
      ...RATE_LIMITS.storefrontRecommendations,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable) {
      throw new RateLimitError('Não foi possível revisar este pedido agora. Tente novamente.');
    }
    if (!rateLimit.allowed) throw new RateLimitError('Muitas tentativas. Aguarde alguns segundos.');

    const cookieStore = await cookies();
    const result = await prepareOrderRepeat({
      tenantId: store.tenantId,
      storeId: store.id,
      orderId: parsedBody.data.orderId,
      trackingToken: parsedBody.data.trackingToken,
      deviceToken: cookieStore.get(getStorefrontDeviceCookieName())?.value,
    });
    if (!result) throw new NotFoundError('Pedido');

    return Response.json(result, { headers });
  } catch (error) {
    const response = errorToResponse(error);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
}
