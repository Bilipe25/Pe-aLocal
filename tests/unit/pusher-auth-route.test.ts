import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/(dashboard)/dashboard/api/pusher/auth/route';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  authorizePusherChannel: vi.fn(),
  isPusherServerConfigured: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/lib/pusher/server', () => ({
  authorizePusherChannel: mocks.authorizePusherChannel,
  isPusherServerConfigured: mocks.isPusherServerConfigured,
}));

function request(channelName: string) {
  const body = new FormData();
  body.set('socket_id', '123.456');
  body.set('channel_name', channelName);
  return new Request('http://localhost/dashboard/api/pusher/auth', { method: 'POST', body });
}

describe('Pusher channel authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue({
      store: { id: '4da03571-bffd-45ef-8c44-20686c487838' },
    });
    mocks.isPusherServerConfigured.mockReturnValue(true);
    mocks.authorizePusherChannel.mockReturnValue({ auth: 'signed-channel' });
  });

  it('autoriza somente o canal privado da loja ativa', async () => {
    const response = await POST(request('private-store-4da03571-bffd-45ef-8c44-20686c487838'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ auth: 'signed-channel' });
    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.VIEW_ORDERS);
    expect(mocks.authorizePusherChannel).toHaveBeenCalledWith(
      '123.456',
      'private-store-4da03571-bffd-45ef-8c44-20686c487838',
    );
  });

  it('rejeita canal de outra loja', async () => {
    const response = await POST(request('private-store-65bdab05-46f3-40ed-9285-c733721d8709'));

    expect(response.status).toBe(403);
    expect(mocks.authorizePusherChannel).not.toHaveBeenCalled();
  });

  it('retorna indisponível sem configuração do servidor', async () => {
    mocks.isPusherServerConfigured.mockReturnValue(false);

    const response = await POST(request('private-store-4da03571-bffd-45ef-8c44-20686c487838'));

    expect(response.status).toBe(503);
    expect(mocks.authorizePusherChannel).not.toHaveBeenCalled();
  });
});
