import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

import { hashConsumerOtp } from '@/server/consumer-verification/otp';
import {
  confirmConsumerEmailChange,
  requestConsumerEmailChange,
} from '@/server/services/consumer-auth.service';

const sessionToken = 's'.repeat(43);
const challengeToken = 'c'.repeat(43);
const developmentSecret = 'pedidolocal-development-only-otp-secret-v1';
const scope = {
  id: 'store-1',
  tenantId: 'tenant-1',
  slug: 'loja',
  name: 'Loja',
  entitlement: { consumerIdentityEnabled: true, consumerConvenienceV2Enabled: true },
};

function authenticatedSession() {
  return {
    id: 'session-1',
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: new Date(),
    consumerIdentity: {
      id: 'identity-1',
      phoneNormalized: null,
      emailNormalized: 'atual@example.com',
      customers: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('CONSUMER_VERIFICATION_OTP_SECRET', '');
});

describe('consumer email change service', () => {
  it('creates a scoped OTP challenge without merging identities before verification', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      consumerEmailChangeRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
      consumerVerificationChallenge: { create: vi.fn().mockResolvedValue({}) },
      consumerIdentity: { findUnique: vi.fn() },
    };
    const db = {
      store: { findFirst: vi.fn().mockResolvedValue(scope) },
      consumerSession: { findFirst: vi.fn().mockResolvedValue(authenticatedSession()) },
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation === 'function') {
          return (operation as (client: typeof tx) => unknown)(tx);
        }
        return operation;
      }),
    };
    mocks.getDb.mockReturnValue(db);

    const result = await requestConsumerEmailChange({
      storeSlug: 'loja',
      sessionToken,
      newEmailNormalized: 'novo@example.com',
    });

    expect(result.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(tx.consumerEmailChangeRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        consumerIdentityId: 'identity-1',
        initiatedBySessionId: 'session-1',
        newEmailNormalized: 'novo@example.com',
      }),
    });
    expect(tx.consumerVerificationChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        emailNormalized: 'novo@example.com',
        purpose: 'EMAIL_CHANGE_NEW',
        otpHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    });
    expect(tx.consumerIdentity.findUnique).not.toHaveBeenCalled();
  });

  it('counts the fifth invalid code atomically and never rotates a session', async () => {
    const otpHash = await hashConsumerOtp({
      challengeToken,
      code: '000000',
      secret: developmentSecret,
    });
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      consumerVerificationChallenge: {
        findFirst: vi.fn().mockResolvedValue({ attemptCount: 4 }),
        update,
      },
      consumerSession: { updateMany: vi.fn() },
    };
    const db = {
      store: { findFirst: vi.fn().mockResolvedValue(scope) },
      consumerSession: { findFirst: vi.fn().mockResolvedValue(authenticatedSession()) },
      consumerVerificationChallenge: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'challenge-1',
          provider: 'development',
          otpHash,
        }),
      },
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation === 'function') {
          return (operation as (client: typeof tx) => unknown)(tx);
        }
        return operation;
      }),
    };
    mocks.getDb.mockReturnValue(db);

    await expect(
      confirmConsumerEmailChange({
        storeSlug: 'loja',
        sessionToken,
        challengeToken,
        code: '999999',
      }),
    ).rejects.toThrow('O código informado é inválido ou expirou.');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { attemptCount: 5, status: 'FAILED' },
    });
    expect(tx.consumerSession.updateMany).not.toHaveBeenCalled();
  });
});
