import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCustomerOrderTrackingStates: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@/server/services/customer-order-tracking.service', () => ({
  getCustomerOrderTrackingStates: mocks.getCustomerOrderTrackingStates,
}));
vi.mock('@/server/rate-limit', () => ({
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
  RATE_LIMITS: { storefrontRecommendations: { maxAttempts: 30, windowInSeconds: 60 } },
}));
vi.mock('@/server/runtime-environment', () => ({ isDeployedRuntime: () => false }));

import { POST } from '@/app/api/orders/history/route';

const tokenA = '4da03571-bffd-45ef-8c44-20686c487838';
const tokenB = 'ba9b00e3-3b4f-4e69-94ac-5ae4efb02225';

function request(body: unknown) {
  return new Request('http://localhost/api/orders/history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, unavailable: false });
    mocks.getCustomerOrderTrackingStates.mockResolvedValue([null, { orderNumber: 12 }]);
  });

  it('faz uma consulta em lote e desabilita cache', async () => {
    const response = await POST(
      request({ storeSlug: 'burger-do-ze', trackingTokens: [tokenA, tokenB] }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.getCustomerOrderTrackingStates).toHaveBeenCalledOnce();
    expect(mocks.getCustomerOrderTrackingStates).toHaveBeenCalledWith(
      [tokenA, tokenB],
      'burger-do-ze',
    );
    expect(await response.json()).toEqual({ orders: [null, { orderNumber: 12 }] });
  });

  it('rejeita tokens repetidos e mais de cinco tokens', async () => {
    const repeated = await POST(
      request({ storeSlug: 'burger-do-ze', trackingTokens: [tokenA, tokenA] }),
    );
    const excessive = await POST(
      request({
        storeSlug: 'burger-do-ze',
        trackingTokens: [tokenA, tokenB, tokenA, tokenB, tokenA, tokenB],
      }),
    );

    expect(repeated.status).toBe(400);
    expect(excessive.status).toBe(400);
    expect(mocks.getCustomerOrderTrackingStates).not.toHaveBeenCalled();
  });
});
