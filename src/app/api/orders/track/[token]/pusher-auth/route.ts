import { z } from 'zod';

import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';
import { authorizePusherChannel, isPusherServerConfigured } from '@/lib/pusher/server';
import {
  errorToResponse,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from '@/server/errors';
import { getCustomerOrderTrackingState } from '@/server/services/customer-order-tracking.service';

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

    const state = await getCustomerOrderTrackingState(parsed.data.token, parsed.data.storeSlug);
    if (!state) throw new NotFoundError('Pedido');
    const expectedChannel = await privateCustomerOrderChannel(parsed.data.token);
    if (parsed.data.channelName !== expectedChannel) {
      throw new TenantAccessError('Este canal não pertence ao acompanhamento informado.');
    }
    if (!isPusherServerConfigured()) {
      return Response.json(
        { error: 'Tempo real indisponível.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

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
