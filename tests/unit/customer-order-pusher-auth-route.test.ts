import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/orders/track/[token]/pusher-auth/route';

const mocks = vi.hoisted(() => ({
  canAuthorizeCustomerOrderTracking: vi.fn(),
  privateCustomerOrderChannel: vi.fn(),
  authorizePusherChannel: vi.fn(),
  isPusherServerConfigured: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@/server/services/customer-order-tracking.service', () => ({
  canAuthorizeCustomerOrderTracking: mocks.canAuthorizeCustomerOrderTracking,
}));
vi.mock('@/lib/pusher/customer-channel', () => ({
  privateCustomerOrderChannel: mocks.privateCustomerOrderChannel,
}));
vi.mock('@/lib/pusher/server', () => ({
  authorizePusherChannel: mocks.authorizePusherChannel,
  isPusherServerConfigured: mocks.isPusherServerConfigured,
}));
vi.mock('@/server/rate-limit', () => ({
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
  RATE_LIMITS: {
    publicOrderRealtimeAuthByIp: { maxAttempts: 60, windowInSeconds: 60 },
    publicOrderRealtimeAuthByToken: { maxAttempts: 10, windowInSeconds: 60 },
  },
}));
vi.mock('@/server/rate-limit/public-identifiers', () => ({
  getPublicClientAddress: () => '127.0.0.1',
  hashPublicRateLimitValue: async (scope: string) => `${scope}-hash`,
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
    mocks.canAuthorizeCustomerOrderTracking.mockResolvedValue(true);
    mocks.privateCustomerOrderChannel.mockResolvedValue(channel);
    mocks.isPusherServerConfigured.mockReturnValue(true);
    mocks.authorizePusherChannel.mockReturnValue({ auth: 'signed-order-channel' });
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, unavailable: false });
  });

  it('autoriza somente o canal derivado do token válido e do slug correto', async () => {
    const response = await POST(request(), { params: Promise.resolve({ token }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ auth: 'signed-order-channel' });
    expect(mocks.canAuthorizeCustomerOrderTracking).toHaveBeenCalledWith(token, 'burger-do-ze');
    expect(mocks.authorizePusherChannel).toHaveBeenCalledWith('123.456', channel);
    expect(mocks.rateLimitCheck).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitCheck.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ identifier: expect.stringContaining(token) }),
    );
  });

  it('rejeita outro canal mesmo com token existente', async () => {
    const response = await POST(request(`private-order-${'b'.repeat(64)}`), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(403);
    expect(mocks.authorizePusherChannel).not.toHaveBeenCalled();
    expect(mocks.canAuthorizeCustomerOrderTracking).not.toHaveBeenCalled();
  });

  it('limita a autorização antes de consultar o pedido', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ allowed: false, unavailable: false });

    const response = await POST(request(), { params: Promise.resolve({ token }) });

    expect(response.status).toBe(429);
    expect(mocks.canAuthorizeCustomerOrderTracking).not.toHaveBeenCalled();
    expect(mocks.authorizePusherChannel).not.toHaveBeenCalled();
  });
});
