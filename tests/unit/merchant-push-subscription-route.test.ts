import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  requireContext: vi.fn(),
  getState: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  setCookie: vi.fn(),
  clearCookie: vi.fn(),
}));

vi.mock('@/server/runtime-environment', () => ({ isDeployedRuntime: () => false }));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: {
    merchantPushRead: { maxAttempts: 60, windowInSeconds: 60 },
    merchantPush: { maxAttempts: 10, windowInSeconds: 60 },
  },
  getRateLimiter: () => ({ check: mocks.check }),
}));
vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireContext,
}));
vi.mock('@/server/services/store-staff-push-subscription.service', () => ({
  getStoreStaffPushSubscriptionState: mocks.getState,
  enableStoreStaffPushSubscription: mocks.enable,
  disableStoreStaffPushSubscription: mocks.disable,
  setMerchantPushDeviceCookie: mocks.setCookie,
  clearMerchantPushDeviceCookie: mocks.clearCookie,
}));

import { DELETE, GET, POST } from '@/app/(dashboard)/dashboard/api/push-subscription/route';

const mutableEnv = process.env as Record<string, string | undefined>;
const previousFlag = mutableEnv.MERCHANT_WEB_PUSH_ENABLED;
const endpointHash = 'a'.repeat(64);
const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString('base64url');
const auth = Buffer.alloc(16, 2).toString('base64url');
const url = 'http://localhost/dashboard/api/push-subscription';

describe('API administrativa de Web Push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.MERCHANT_WEB_PUSH_ENABLED = 'true';
    mocks.check.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 });
    mocks.requireContext.mockResolvedValue({
      session: { userId: 'user-1', tenantId: 'tenant-1', tenantRole: 'OWNER' },
      store: { id: 'store-1' },
    });
    mocks.getState.mockResolvedValue({ enabled: true, badgeCount: 2 });
    mocks.enable.mockResolvedValue({
      enabled: true,
      endpointHash,
      subscriptionId: '00000000-0000-4000-8000-000000000001',
    });
    mocks.disable.mockResolvedValue({ enabled: false, remaining: 0 });
  });

  afterAll(() => {
    if (previousFlag === undefined) delete mutableEnv.MERCHANT_WEB_PUSH_ENABLED;
    else mutableEnv.MERCHANT_WEB_PUSH_ENABLED = previousFlag;
  });

  it('retorna somente estado e badge do dispositivo autenticado', async () => {
    const response = await GET(new Request(`${url}?endpointHash=${endpointHash}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, badgeCount: 2 });
    expect(mocks.getState).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        tenantRole: 'OWNER',
        storeId: 'store-1',
      },
      endpointHash,
    );
    expect(mocks.check).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'merchant-push-read:user-1', maxAttempts: 60 }),
    );
  });

  it('deriva todo o escopo da sessÃ£o e grava cookie opaco', async () => {
    const response = await POST(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/id',
          expirationTime: null,
          keys: { p256dh, auth },
          userId: 'forged-user',
          storeId: 'forged-store',
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.enable).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          tenantRole: 'OWNER',
          storeId: 'store-1',
        },
      }),
    );
    expect(mocks.setCookie).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(mocks.check).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'merchant-push-mutation:user-1', maxAttempts: 10 }),
    );
  });

  it('desabilita somente a loja ativa e limpa cookie quando nÃ£o resta vÃ­nculo', async () => {
    const response = await DELETE(
      new Request(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ endpointHash }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.disable).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointHash,
        context: expect.objectContaining({ storeId: 'store-1' }),
      }),
    );
    expect(mocks.clearCookie).toHaveBeenCalledOnce();
  });
});
