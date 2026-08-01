import { z } from 'zod';

import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { authorizePusherChannel, isPusherServerConfigured } from '@/lib/pusher/server';
import {
  errorToResponse,
  NotFoundError,
  RateLimitError,
  TenantAccessError,
  ValidationError,
} from '@/server/errors';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import {
  getPublicClientAddress,
  hashPublicRateLimitValue,
} from '@/server/rate-limit/public-identifiers';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { canAuthorizeCustomerOrderTracking } from '@/server/services/customer-order-tracking.service';

const authorizationSchema = z.object({
  token: z.string().uuid(),
  storeSlug: z.string().trim().min(1).max(120),
  socketId: z
    .string()
    .regex(/^\d+\.\d+$/)
    .max(100),
  channelName: z.string().max(200),
});

function privateErrorResponse(error: unknown) {
  const response = errorToResponse(error);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const formData = await request.formData();
    const parsed = authorizationSchema.safeParse({
      token,
      storeSlug: new URL(request.url).searchParams.get('storeSlug'),
      socketId: formData.get('socket_id'),
      channelName: formData.get('channel_name'),
    });
    if (!parsed.success) throw new ValidationError('A autorização do acompanhamento é inválida.');

    const [expectedChannel, clientKey, tokenKey] = await Promise.all([
      privateCustomerOrderChannel(parsed.data.token),
      hashPublicRateLimitValue('tracking-auth-ip', getPublicClientAddress(request)),
      hashPublicRateLimitValue('tracking-auth-token', parsed.data.token),
    ]);
    const limiter = getRateLimiter();
    const [ipRateLimit, tokenRateLimit] = await Promise.all([
      limiter.check({
        identifier: `tracking-auth-ip:${clientKey}`,
        ...RATE_LIMITS.publicOrderRealtimeAuthByIp,
        strict: isDeployedRuntime(),
      }),
      limiter.check({
        identifier: `tracking-auth-token:${tokenKey}`,
        ...RATE_LIMITS.publicOrderRealtimeAuthByToken,
        strict: isDeployedRuntime(),
      }),
    ]);
    if (
      ipRateLimit.unavailable ||
      tokenRateLimit.unavailable ||
      !ipRateLimit.allowed ||
      !tokenRateLimit.allowed
    ) {
      throw new RateLimitError('Muitas tentativas de conexão. Aguarde um minuto.');
    }
    if (parsed.data.channelName !== expectedChannel) {
      throw new TenantAccessError('Este canal não pertence ao acompanhamento informado.');
    }
    if (!isPusherServerConfigured()) {
      return Response.json(
        { error: 'Tempo real indisponível.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const allowed = await canAuthorizeCustomerOrderTracking(
      parsed.data.token,
      parsed.data.storeSlug,
    );
    if (!allowed) throw new NotFoundError('Pedido');

    return Response.json(authorizePusherChannel(parsed.data.socketId, parsed.data.channelName), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return privateErrorResponse(error);
  }
}
