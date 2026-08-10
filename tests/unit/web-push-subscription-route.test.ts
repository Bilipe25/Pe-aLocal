import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: true,
  check: vi.fn(),
  getState: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('@/lib/web-push/config', () => ({ isWebPushEnabled: () => mocks.enabled }));
vi.mock('@/server/runtime-environment', () => ({ isDeployedRuntime: () => false }));
vi.mock('@/server/rate-limit/public-identifiers', () => ({
  getPublicClientAddress: () => '127.0.0.1',
  hashPublicRateLimitValue: async (_scope: string, value: string) => `hash:${value}`,
}));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: {
    publicOrderPushByIp: { maxAttempts: 30, windowInSeconds: 60 },
    publicOrderPushByToken: { maxAttempts: 10, windowInSeconds: 60 },
  },
  getRateLimiter: () => ({ check: mocks.check }),
}));
vi.mock('@/server/services/web-push-subscription.service', () => ({
  getOrderPushSubscriptionState: mocks.getState,
  enableOrderPushSubscription: mocks.enable,
  disableOrderPushSubscription: mocks.disable,
}));

import { DELETE, GET, POST } from '@/app/api/orders/track/[token]/push-subscription/route';

const token = '00000000-0000-4000-8000-000000000001';
const endpointHash = 'a'.repeat(64);
const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const auth = Buffer.alloc(16, 2).toString('base64url');
const context = { params: Promise.resolve({ token }) };
const url = `http://localhost/api/orders/track/${token}/push-subscription?storeSlug=burger-do-ze`;

describe('API pública de inscrição Web Push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.check.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 });
    mocks.getState.mockResolvedValue({ enabled: true, terminal: false });
    mocks.enable.mockResolvedValue({ enabled: true, endpointHash });
    mocks.disable.mockResolvedValue({ enabled: false });
  });

  it('responde apenas o estado público da associação', async () => {
    const response = await GET(new Request(`${url}&endpointHash=${endpointHash}`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('habilita inscrição validada em mutação same-origin', async () => {
    const response = await POST(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/id',
          expirationTime: null,
          keys: { p256dh, auth },
        }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(mocks.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        publicToken: token,
        storeSlug: 'burger-do-ze',
        origin: 'http://localhost',
      }),
    );
  });

  it('desabilita somente a associação identificada pelo hash', async () => {
    const response = await DELETE(
      new Request(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ endpointHash }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.disable).toHaveBeenCalledWith({
      publicToken: token,
      storeSlug: 'burger-do-ze',
      endpointHash,
    });
  });

  it('não consulta pedido quando a feature está desligada', async () => {
    mocks.enabled = false;
    const response = await GET(new Request(`${url}&endpointHash=${endpointHash}`), context);
    expect(await response.json()).toEqual({ enabled: false });
    expect(mocks.getState).not.toHaveBeenCalled();
  });
});
