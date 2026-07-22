import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/orders/track/[token]/pusher-auth/route';

const mocks = vi.hoisted(() => ({
  getCustomerOrderTrackingState: vi.fn(),
  privateCustomerOrderChannel: vi.fn(),
  authorizePusherChannel: vi.fn(),
  isPusherServerConfigured: vi.fn(),
}));

vi.mock('@/server/services/customer-order-tracking.service', () => ({
  getCustomerOrderTrackingState: mocks.getCustomerOrderTrackingState,
}));
vi.mock('@/lib/pusher/customer-channel', () => ({
  privateCustomerOrderChannel: mocks.privateCustomerOrderChannel,
}));
vi.mock('@/lib/pusher/server', () => ({
  authorizePusherChannel: mocks.authorizePusherChannel,
  isPusherServerConfigured: mocks.isPusherServerConfigured,
}));

const token = '4da03571-bffd-45ef-8c44-20686c487838';
const channel = `private-order-${'a'.repeat(64)}`;

function request(channelName = channel) {
  const body = new FormData();
  body.set('socket_id', '123.456');
  body.set('channel_name', channelName);
  return new Request(
    `http://localhost/api/orders/track/${token}/pusher-auth?storeSlug=burger-do-ze`,
    { method: 'POST', body },
  );
}

describe('autorização Pusher do acompanhamento público', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomerOrderTrackingState.mockResolvedValue({ status: 'PENDING' });
    mocks.privateCustomerOrderChannel.mockResolvedValue(channel);
    mocks.isPusherServerConfigured.mockReturnValue(true);
    mocks.authorizePusherChannel.mockReturnValue({ auth: 'signed-order-channel' });
  });

  it('autoriza somente o canal derivado do token válido e do slug correto', async () => {
    const response = await POST(request(), { params: Promise.resolve({ token }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ auth: 'signed-order-channel' });
    expect(mocks.getCustomerOrderTrackingState).toHaveBeenCalledWith(token, 'burger-do-ze');
    expect(mocks.authorizePusherChannel).toHaveBeenCalledWith('123.456', channel);
  });

  it('rejeita outro canal mesmo com token existente', async () => {
    const response = await POST(request(`private-order-${'b'.repeat(64)}`), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(403);
    expect(mocks.authorizePusherChannel).not.toHaveBeenCalled();
  });
});
