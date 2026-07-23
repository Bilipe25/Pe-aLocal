import { z } from 'zod';

import { privateStoreChannel } from '@/lib/pusher/channels';
import {
  authorizePusherChannel,
  isPusherServerConfigured,
} from '@/lib/pusher/server';
import { errorToResponse, TenantAccessError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

const authorizationSchema = z.object({
  socketId: z.string().regex(/^\d+\.\d+$/).max(100),
  channelName: z.string().max(200),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = authorizationSchema.safeParse({
      socketId: formData.get('socket_id'),
      channelName: formData.get('channel_name'),
    });
    if (!parsed.success) throw new ValidationError('A autorização do canal é inválida.');

    const { store } = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    if (parsed.data.channelName !== privateStoreChannel(store.id)) {
      throw new TenantAccessError('Este canal de pedidos não pertence à loja ativa.');
    }
    if (!isPusherServerConfigured()) {
      return Response.json(
        { error: 'Tempo real indisponível.' },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    return Response.json(
      authorizePusherChannel(parsed.data.socketId, parsed.data.channelName),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
