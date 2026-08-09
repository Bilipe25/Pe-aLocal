import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookiesGet: vi.fn(),
  getPublicStoreScopeBySlug: vi.fn(),
  prepareOrderRepeat: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookiesGet })),
}));
vi.mock('@/server/queries/public-store', () => ({
  getPublicStoreScopeBySlug: mocks.getPublicStoreScopeBySlug,
}));
vi.mock('@/server/services/repeat-order.service', () => ({
  prepareOrderRepeat: mocks.prepareOrderRepeat,
}));
vi.mock('@/server/services/customer-device-recognition.service', () => ({
  getStorefrontDeviceCookieName: () => 'pedidolocal_device',
}));
vi.mock('@/server/rate-limit', () => ({
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
  RATE_LIMITS: { storefrontRecommendations: { maxAttempts: 30, windowInSeconds: 60 } },
}));
vi.mock('@/server/runtime-environment', () => ({ isDeployedRuntime: () => false }));

import { POST } from '@/app/api/storefront/[storeSlug]/repeat-order/route';

const trackingToken = '4da03571-bffd-45ef-8c44-20686c487838';

function request(body: unknown) {
  return new Request('http://localhost/api/storefront/burger-do-ze/repeat-order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/storefront/[storeSlug]/repeat-order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicStoreScopeBySlug.mockResolvedValue({ id: 'store-a', tenantId: 'tenant-a' });
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, unavailable: false });
    mocks.cookiesGet.mockReturnValue({ value: 'd'.repeat(43) });
    mocks.prepareOrderRepeat.mockResolvedValue({ readyItems: [], issues: [] });
  });

  it('passa somente o escopo público resolvido no servidor', async () => {
    const response = await POST(request({ trackingToken }), {
      params: Promise.resolve({ storeSlug: 'burger-do-ze' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(mocks.prepareOrderRepeat).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      trackingToken,
      orderId: undefined,
      deviceToken: 'd'.repeat(43),
    });
  });

  it('rejeita corpo ambíguo antes de consultar o catálogo', async () => {
    const response = await POST(request({ orderId: 'order-a', trackingToken }), {
      params: Promise.resolve({ storeSlug: 'burger-do-ze' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.prepareOrderRepeat).not.toHaveBeenCalled();
  });

  it('não consulta o pedido quando o limite foi excedido', async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false, unavailable: false });

    const response = await POST(request({ trackingToken }), {
      params: Promise.resolve({ storeSlug: 'burger-do-ze' }),
    });

    expect(response.status).toBe(429);
    expect(mocks.prepareOrderRepeat).not.toHaveBeenCalled();
  });
});
