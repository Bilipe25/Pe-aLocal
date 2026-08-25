import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

import { hashConsumerOtp } from '@/server/consumer-verification/otp';
import {
  requestConsumerVerification,
  resolveConsumerVerificationContext,
  verifyConsumerCode,
} from '@/server/services/consumer-auth.service';

const challengeToken = 'a'.repeat(43);
const developmentSecret = 'pedidolocal-development-only-otp-secret-v1';
const scope = {
  id: 'store-1',
  tenantId: 'tenant-1',
  slug: 'loja-teste',
  name: 'Loja Teste',
  entitlement: { consumerIdentityEnabled: true, consumerConvenienceV2Enabled: true },
};

async function emailChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'challenge-1',
    challengeTokenHash: 'b'.repeat(64),
    tenantId: 'tenant-1',
    storeId: 'store-1',
    phoneNormalized: null,
    emailNormalized: 'cliente@example.com',
    otpHash: await hashConsumerOtp({
      challengeToken,
      code: '000000',
      secret: developmentSecret,
    }),
    purpose: 'LOGIN',
    status: 'PENDING',
    provider: 'development',
    consumerIdentityId: null,
    claimCustomerId: null,
    claimOrderId: null,
    attemptCount: 0,
    resendCount: 0,
    resendAfter: new Date(0),
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null,
    consumedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function verificationDb(input: {
  outerChallenge: Awaited<ReturnType<typeof emailChallenge>> | null;
  currentChallenge?: Awaited<ReturnType<typeof emailChallenge>> | null;
  customerFindFirst?: ReturnType<typeof vi.fn>;
  identityFindUnique?: ReturnType<typeof vi.fn>;
  identityUpsert?: ReturnType<typeof vi.fn>;
  identityUpdate?: ReturnType<typeof vi.fn>;
}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    consumerVerificationChallenge: {
      findFirst: vi.fn().mockResolvedValue(input.currentChallenge ?? input.outerChallenge),
      update: vi.fn().mockResolvedValue({}),
    },
    consumerIdentity: {
      findUnique: input.identityFindUnique ?? vi.fn().mockResolvedValue(null),
      upsert: input.identityUpsert ?? vi.fn().mockResolvedValue({ id: 'identity-email' }),
      update: input.identityUpdate ?? vi.fn().mockResolvedValue({ id: 'identity-email' }),
    },
    customer: {
      findFirst: input.customerFindFirst ?? vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    consumerSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const db = {
    store: { findFirst: vi.fn().mockResolvedValue(scope) },
    consumerVerificationChallenge: {
      findFirst: vi.fn().mockResolvedValue(input.outerChallenge),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { db, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'development');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'development');
  vi.stubEnv('CONSUMER_VERIFICATION_OTP_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('consumer email verification service', () => {
  it('does not query Customer when a new email is used only for LOGIN', async () => {
    const challenge = await emailChallenge();
    const { db, tx } = verificationDb({ outerChallenge: challenge });
    mocks.getDb.mockReturnValue(db);

    await expect(
      verifyConsumerCode({ storeSlug: 'loja-teste', challengeToken, code: '000000' }),
    ).resolves.toMatchObject({ linked: false, customerName: null });
    expect(tx.customer.findFirst).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.consumerIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { emailNormalized: 'cliente@example.com' } }),
    );
    expect(tx.consumerSession.create).toHaveBeenCalledTimes(1);
  });

  it('adds email to the same legacy phone identity only after an exact strong claim', async () => {
    const challenge = await emailChallenge({
      purpose: 'ORDER_CLAIM',
      phoneNormalized: '5585999999999',
      claimCustomerId: 'customer-1',
      claimOrderId: 'order-1',
    });
    const customerFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Cliente',
        phoneNormalized: '5585999999999',
        consumerIdentityId: 'legacy-phone-identity',
      })
      .mockResolvedValueOnce(null);
    const identityFindUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'legacy-phone-identity', emailNormalized: null });
    const identityUpdate = vi.fn().mockResolvedValue({ id: 'legacy-phone-identity' });
    const { db, tx } = verificationDb({
      outerChallenge: challenge,
      customerFindFirst,
      identityFindUnique,
      identityUpdate,
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      verifyConsumerCode({ storeSlug: 'loja-teste', challengeToken, code: '000000' }),
    ).resolves.toMatchObject({ linked: true, customerName: 'Cliente' });
    expect(identityUpdate).toHaveBeenCalledWith({
      where: { id: 'legacy-phone-identity' },
      data: {
        emailNormalized: 'cliente@example.com',
        emailVerifiedAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'customer-1' },
        data: expect.objectContaining({ consumerIdentityId: 'legacy-phone-identity' }),
      }),
    );
  });

  it('rejects an email already owned by another identity instead of replacing a link', async () => {
    const challenge = await emailChallenge({
      purpose: 'ORDER_CLAIM',
      phoneNormalized: '5585999999999',
      claimCustomerId: 'customer-1',
      claimOrderId: 'order-1',
    });
    const customerFindFirst = vi.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Cliente',
      phoneNormalized: '5585999999999',
      consumerIdentityId: 'legacy-phone-identity',
    });
    const identityFindUnique = vi.fn().mockResolvedValue({ id: 'another-email-identity' });
    const { db, tx } = verificationDb({
      outerChallenge: challenge,
      customerFindFirst,
      identityFindUnique,
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      verifyConsumerCode({ storeSlug: 'loja-teste', challengeToken, code: '000000' }),
    ).rejects.toThrow('Não foi possível confirmar esta conta.');
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.consumerSession.create).not.toHaveBeenCalled();
  });

  it('fails the challenge on the fifth wrong code without creating a session', async () => {
    const challenge = await emailChallenge({ attemptCount: 4 });
    const { db, tx } = verificationDb({ outerChallenge: challenge });
    mocks.getDb.mockReturnValue(db);

    await expect(
      verifyConsumerCode({ storeSlug: 'loja-teste', challengeToken, code: '999999' }),
    ).rejects.toThrow('O código informado é inválido ou expirou.');
    expect(tx.consumerVerificationChallenge.update).toHaveBeenCalledWith({
      where: { id: 'challenge-1' },
      data: { attemptCount: 5, status: 'FAILED' },
    });
    expect(tx.consumerSession.create).not.toHaveBeenCalled();
  });

  it('scopes every challenge lookup to the current tenant and store', async () => {
    const { db } = verificationDb({ outerChallenge: null });
    mocks.getDb.mockReturnValue(db);

    await expect(
      verifyConsumerCode({ storeSlug: 'loja-teste', challengeToken, code: '000000' }),
    ).rejects.toThrow('Esta confirmação expirou.');
    expect(db.consumerVerificationChallenge.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1' }),
    });
  });

  it('does not look up an arbitrary Customer for email LOGIN context', async () => {
    const db = {
      store: { findFirst: vi.fn().mockResolvedValue(scope) },
      order: { findFirst: vi.fn() },
      customerDeviceRecognition: { findFirst: vi.fn() },
    };
    mocks.getDb.mockReturnValue(db);

    const context = await resolveConsumerVerificationContext({
      storeSlug: 'loja-teste',
      request: {
        purpose: 'LOGIN',
        email: 'cliente@example.com',
      },
    });
    expect(context.claim).toMatchObject({
      customerId: null,
      orderId: null,
      phoneNormalized: null,
      emailNormalized: 'cliente@example.com',
    });
    expect(db.order.findFirst).not.toHaveBeenCalled();
    expect(db.customerDeviceRecognition.findFirst).not.toHaveBeenCalled();
  });

  it('marks a persisted challenge FAILED when Resend cannot deliver it', async () => {
    vi.stubEnv('CONSUMER_VERIFICATION_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_1234567890abcdefghijklmnop');
    vi.stubEnv('RESEND_FROM_EMAIL', 'acesso@updates.example.com');
    vi.stubEnv('CONSUMER_VERIFICATION_OTP_SECRET', 'a-secure-test-secret-with-32-characters');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      consumerVerificationChallenge: {
        count: vi.fn().mockResolvedValue(0),
        create,
      },
    };
    const db = {
      store: { findFirst: vi.fn().mockResolvedValue(scope) },
      order: { findFirst: vi.fn() },
      customerDeviceRecognition: { findFirst: vi.fn() },
      consumerVerificationChallenge: {
        create,
        updateMany,
        update: vi.fn(),
      },
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation === 'function') {
          return (operation as (client: typeof tx) => unknown)(tx);
        }
        return operation;
      }),
    };
    mocks.getDb.mockReturnValue(db);
    const context = await resolveConsumerVerificationContext({
      storeSlug: 'loja-teste',
      request: { purpose: 'LOGIN', email: 'cliente@example.com' },
    });

    await expect(requestConsumerVerification({ context })).rejects.toThrow(
      'Não conseguimos enviar o código agora.',
    );
    const persisted = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(persisted.otpHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted).not.toHaveProperty('code');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: persisted.id,
        status: 'PENDING',
        consumedAt: null,
      },
      data: { status: 'FAILED' },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
