import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/orders/track/[token]/route';

const mocks = vi.hoisted(() => ({
  getCustomerOrderTrackingState: vi.fn(),
  isPublicOrderTokenExpired: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@/server/services/customer-order-tracking.service', () => ({
  getCustomerOrderTrackingState: mocks.getCustomerOrderTrackingState,
}));
vi.mock('@/server/repositories/order.repository', () => ({
  isPublicOrderTokenExpired: mocks.isPublicOrderTokenExpired,
}));
vi.mock('@/server/rate-limit', () => ({
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
  RATE_LIMITS: {
    publicOrderLookupByIp: { maxAttempts: 60, windowInSeconds: 60 },
    publicOrderLookupByToken: { maxAttempts: 10, windowInSeconds: 60 },
  },
}));
vi.mock('@/server/rate-limit/public-identifiers', () => ({
  getPublicClientAddress: () => '127.0.0.1',
  hashPublicRateLimitValue: async (scope: string) => `${scope}-hash`,
}));

const token = '4da03571-bffd-45ef-8c44-20686c487838';
const state = {
  orderNumber: 42,
  modality: 'PICKUP',
  status: 'PREPARING',
  paymentStatus: 'PENDING',
  version: 3,
  statusChangedAt: '2026-07-22T12:05:00.000Z',
  updatedAt: '2026-07-22T12:06:00.000Z',
  estimate: null,
  cancellationMessage: null,
};

describe('GET /api/orders/track/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCustomerOrderTrackingState.mockResolvedValue(state);
    mocks.isPublicOrderTokenExpired.mockResolvedValue(false);
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, unavailable: false });
  });

  it('retorna apenas o estado mínimo e desabilita cache', async () => {
    const response = await GET(
      new Request(`http://localhost/api/orders/track/${token}?storeSlug=burger-do-ze`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual(state);
    expect(mocks.getCustomerOrderTrackingState).toHaveBeenCalledWith(token, 'burger-do-ze');
    expect(mocks.rateLimitCheck).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(state)).not.toContain('customerPhone');
  });

  it('não diferencia token ausente de slug incorreto', async () => {
    mocks.getCustomerOrderTrackingState.mockResolvedValue(null);
    const response = await GET(
      new Request(`http://localhost/api/orders/track/${token}?storeSlug=outra-loja`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(404);
  });

  it('retorna TOKEN_EXPIRED sem serializar dados do pedido', async () => {
    mocks.getCustomerOrderTrackingState.mockResolvedValue(null);
    mocks.isPublicOrderTokenExpired.mockResolvedValue(true);

    const response = await GET(
      new Request(`http://localhost/api/orders/track/${token}?storeSlug=burger-do-ze`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      code: 'TOKEN_EXPIRED',
      details: [],
    });
  });

  it('aplica limites independentes antes da consulta pública', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ allowed: false, unavailable: false });

    const response = await GET(
      new Request(`http://localhost/api/orders/track/${token}?storeSlug=burger-do-ze`),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(429);
    expect(mocks.getCustomerOrderTrackingState).not.toHaveBeenCalled();
  });
});
