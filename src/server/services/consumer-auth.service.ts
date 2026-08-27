import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import type { ConsumerVerificationRequest } from '@/schemas/consumer-auth';
import {
  generateConsumerOtp,
  hashConsumerOtp,
  verifyConsumerOtpHash,
} from '@/server/consumer-verification/otp';
import {
  getConsumerVerificationProvider,
  getConsumerVerificationProviderByName,
  type ConsumerVerificationProvider,
  type ConsumerVerificationSubject,
} from '@/server/consumer-verification/provider';
import { getDb } from '@/server/database/client';
import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '@/server/errors';
import { isDeployedRuntime, isLocalDevelopmentRuntime } from '@/server/runtime-environment';
import {
  getStorefrontDeviceCookieName,
  hashStorefrontDeviceToken,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';
import { processClaimedDeliveredOrders } from '@/server/services/loyalty.service';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_ACTIVITY_TOUCH_MS = 24 * 60 * 60 * 1_000;
const MAX_ACTIVE_SESSIONS = 5;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const PHONE_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const EMAIL_CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS = 5;
const VERIFICATION_LIMIT_WINDOW_MS = 5 * 60 * 1_000;
const VERIFICATION_SUBJECT_LIMIT = 5;
const VERIFICATION_IP_LIMIT = 20;
const VERIFICATION_STORE_LIMIT = 100;
const DEVELOPMENT_OTP_SECRET = 'pedidolocal-development-only-otp-secret-v1';

export const CONSUMER_SESSION_COOKIE = isDeployedRuntime()
  ? '__Host-pedidolocal_consumer'
  : 'pedidolocal_consumer';

export function createConsumerSecret() {
  return randomBytes(32).toString('base64url');
}

export function isConsumerSecret(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

export async function hashConsumerSecret(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function verificationUnavailable() {
  return new BusinessRuleError(
    'Não conseguimos enviar o código agora. Tente novamente em alguns minutos.',
  );
}

function getOtpSecret(providerName: string) {
  const secret = process.env.CONSUMER_VERIFICATION_OTP_SECRET?.trim() ?? '';
  if (secret.length >= 32) return secret;
  if (providerName === 'development' && isLocalDevelopmentRuntime()) return DEVELOPMENT_OTP_SECRET;
  throw verificationUnavailable();
}

function challengeTtl(provider: ConsumerVerificationProvider) {
  return provider.method === 'email' ? EMAIL_CHALLENGE_TTL_MS : PHONE_CHALLENGE_TTL_MS;
}

export function consumerSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isDeployedRuntime(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1_000)),
  };
}

export function clearConsumerSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isDeployedRuntime(),
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  };
}

export async function getConsumerStoreScope(storeSlug: string) {
  return getDb().store.findFirst({
    where: { slug: storeSlug, isActive: true },
    select: {
      id: true,
      tenantId: true,
      slug: true,
      name: true,
      entitlement: {
        select: {
          consumerIdentityEnabled: true,
          consumerConvenienceV2Enabled: true,
        },
      },
    },
  });
}

function assertFeatureEnabled(scope: Awaited<ReturnType<typeof getConsumerStoreScope>>) {
  if (!scope || !scope.entitlement?.consumerIdentityEnabled) throw new NotFoundError('Página');
  return scope;
}

async function resolveClaim(input: {
  tenantId: string;
  storeId: string;
  request: ConsumerVerificationRequest;
  provider: ConsumerVerificationProvider;
  deviceToken?: string | null;
}) {
  const { request, provider } = input;
  const requestedEmail = provider.method === 'email' ? request.email : undefined;
  const requestedPhone = provider.method === 'phone' ? request.phone : undefined;

  if (request.purpose === 'LOGIN') {
    if (provider.method === 'email' && !requestedEmail) throw verificationUnavailable();
    if (provider.method === 'phone' && !requestedPhone) throw verificationUnavailable();
    return {
      customerId: null,
      orderId: null,
      phoneNormalized: requestedPhone ?? null,
      emailNormalized: requestedEmail ?? null,
    };
  }

  if (request.purpose === 'ORDER_CLAIM') {
    const order = await getDb().order.findFirst({
      where: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        publicToken: request.trackingToken,
        publicTokenExpiresAt: { gt: new Date() },
        customerId: { not: null },
      },
      select: {
        id: true,
        customerId: true,
        customerPhoneNormalized: true,
        customer: { select: { phoneNormalized: true } },
      },
    });
    const customerPhone = order?.customer?.phoneNormalized ?? order?.customerPhoneNormalized;
    if (
      !order?.customerId ||
      !customerPhone ||
      (provider.method === 'phone' && requestedPhone && customerPhone !== requestedPhone) ||
      (provider.method === 'email' && !requestedEmail)
    ) {
      throw new BusinessRuleError(
        'Não foi possível confirmar este pedido com os dados informados.',
      );
    }
    return {
      customerId: order.customerId,
      orderId: order.id,
      phoneNormalized: customerPhone,
      emailNormalized: requestedEmail ?? null,
    };
  }

  if (!isStorefrontDeviceToken(input.deviceToken)) {
    throw new BusinessRuleError('Não foi possível confirmar este aparelho.');
  }
  if (provider.method === 'email' && !requestedEmail) throw verificationUnavailable();
  if (provider.method === 'phone' && !requestedPhone) throw verificationUnavailable();
  const deviceHash = await hashStorefrontDeviceToken(input.deviceToken);
  const recognition = await getDb().customerDeviceRecognition.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      storefrontDevice: { tokenHash: deviceHash, expiresAt: { gt: new Date() } },
      ...(requestedPhone ? { customer: { phoneNormalized: requestedPhone } } : {}),
    },
    select: { customerId: true, customer: { select: { phoneNormalized: true } } },
  });
  if (!recognition) throw new BusinessRuleError('Não foi possível confirmar este aparelho.');
  return {
    customerId: recognition.customerId,
    orderId: null,
    phoneNormalized: recognition.customer.phoneNormalized,
    emailNormalized: requestedEmail ?? null,
  };
}

function subjectFromClaim(claim: {
  phoneNormalized: string | null;
  emailNormalized: string | null;
}): ConsumerVerificationSubject {
  if (claim.emailNormalized) return { kind: 'email', normalized: claim.emailNormalized };
  if (claim.phoneNormalized) return { kind: 'phone', normalized: claim.phoneNormalized };
  throw verificationUnavailable();
}

export async function resolveConsumerVerificationContext(input: {
  storeSlug: string;
  request: ConsumerVerificationRequest;
  deviceToken?: string | null;
}) {
  const scope = assertFeatureEnabled(await getConsumerStoreScope(input.storeSlug));
  const provider = getConsumerVerificationProvider();
  if (!provider.isReady()) throw verificationUnavailable();
  const claim = await resolveClaim({
    tenantId: scope.tenantId,
    storeId: scope.id,
    request: input.request,
    provider,
    deviceToken: input.deviceToken,
  });
  const subject = subjectFromClaim(claim);
  return {
    scope,
    claim,
    subject,
    providerName: provider.name,
    request: input.request,
  };
}

async function failChallengeAfterDeliveryError(challengeId: string) {
  try {
    await getDb().consumerVerificationChallenge.updateMany({
      where: { id: challengeId, status: 'PENDING', consumedAt: null },
      data: { status: 'FAILED' },
    });
  } catch {
    // The opaque token was never returned, so this challenge cannot be used.
  }
}

export async function requestConsumerVerification(input: {
  context: Awaited<ReturnType<typeof resolveConsumerVerificationContext>>;
  requestIpHash?: string | null;
}) {
  const { scope, claim, subject, providerName, request } = input.context;
  const provider = getConsumerVerificationProviderByName(providerName);
  if (!provider.isReady() || provider.name === 'disabled') throw verificationUnavailable();

  const challengeId = randomUUID();
  const challengeToken = createConsumerSecret();
  const challengeTokenHash = await hashConsumerSecret(challengeToken);
  const code = provider.ownsCode
    ? undefined
    : provider.name === 'development'
      ? '000000'
      : generateConsumerOtp();
  const otpHash = code
    ? await hashConsumerOtp({ challengeToken, code, secret: getOtpSecret(provider.name) })
    : null;
  const now = new Date();
  const provisionalExpiresAt = new Date(now.getTime() + challengeTtl(provider));
  const resendAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS);

  await getDb().$transaction(
    async (tx) => {
      const subjectLock = `consumer-verification:${scope.tenantId}:${subject.kind}:${subject.normalized}`;
      const lockNames = [
        `consumer-verification-store:${scope.id}`,
        subjectLock,
        ...(input.requestIpHash ? [`consumer-verification-ip:${input.requestIpHash}`] : []),
      ].sort();
      for (const lockName of lockNames) {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`,
        );
      }
      const since = new Date(now.getTime() - VERIFICATION_LIMIT_WINDOW_MS);
      const [subjectCount, ipCount, storeCount] = await Promise.all([
        tx.consumerVerificationChallenge.count({
          where: {
            tenantId: scope.tenantId,
            storeId: scope.id,
            createdAt: { gte: since },
            ...(subject.kind === 'email'
              ? { emailNormalized: subject.normalized }
              : { phoneNormalized: subject.normalized }),
          },
        }),
        input.requestIpHash
          ? tx.consumerVerificationChallenge.count({
              where: { requestIpHash: input.requestIpHash, createdAt: { gte: since } },
            })
          : Promise.resolve(0),
        tx.consumerVerificationChallenge.count({
          where: { tenantId: scope.tenantId, storeId: scope.id, createdAt: { gte: since } },
        }),
      ]);
      if (
        subjectCount >= VERIFICATION_SUBJECT_LIMIT ||
        ipCount >= VERIFICATION_IP_LIMIT ||
        storeCount >= VERIFICATION_STORE_LIMIT
      ) {
        throw new RateLimitError('Muitas tentativas. Aguarde alguns minutos.');
      }
      await tx.consumerVerificationChallenge.create({
        data: {
          id: challengeId,
          challengeTokenHash,
          tenantId: scope.tenantId,
          storeId: scope.id,
          phoneNormalized: claim.phoneNormalized,
          emailNormalized: claim.emailNormalized,
          otpHash,
          purpose: request.purpose,
          provider: provider.name,
          claimCustomerId: claim.customerId,
          claimOrderId: claim.orderId,
          requestIpHash: input.requestIpHash ?? null,
          resendAfter,
          expiresAt: provisionalExpiresAt,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  let started;
  try {
    started = await provider.start({
      subject,
      storeName: scope.name,
      code,
      idempotencyKey: `consumer-otp/${challengeId}`,
    });
  } catch (error) {
    await failChallengeAfterDeliveryError(challengeId);
    throw error;
  }

  const expiresAt = new Date(
    Math.min(started.expiresAt.getTime(), now.getTime() + challengeTtl(provider)),
  );
  await getDb().$transaction([
    getDb().consumerVerificationChallenge.updateMany({
      where: {
        id: { not: challengeId },
        tenantId: scope.tenantId,
        storeId: scope.id,
        provider: provider.name,
        status: 'PENDING',
        consumedAt: null,
        ...(subject.kind === 'email'
          ? { emailNormalized: subject.normalized }
          : { phoneNormalized: subject.normalized }),
      },
      data: { status: 'CANCELLED' },
    }),
    getDb().consumerVerificationChallenge.update({
      where: { id: challengeId },
      data: { expiresAt },
    }),
  ]);

  return { challengeToken, expiresAt, resendAfter };
}

export async function resendConsumerVerification(input: {
  storeSlug: string;
  challengeToken: string;
}) {
  const scope = assertFeatureEnabled(await getConsumerStoreScope(input.storeSlug));
  const challengeTokenHash = await hashConsumerSecret(input.challengeToken);
  const now = new Date();
  const challenge = await getDb().consumerVerificationChallenge.findFirst({
    where: {
      challengeTokenHash,
      tenantId: scope.tenantId,
      storeId: scope.id,
      status: 'PENDING',
      consumedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (!challenge) throw new BusinessRuleError('Esta confirmação expirou. Solicite um novo código.');
  if (challenge.resendAfter > now) {
    const seconds = Math.max(
      1,
      Math.ceil((challenge.resendAfter.getTime() - now.getTime()) / 1_000),
    );
    throw new RateLimitError(`Aguarde ${seconds} segundos para reenviar.`);
  }

  const provider = getConsumerVerificationProviderByName(challenge.provider);
  if (!provider.isReady() || provider.name === 'disabled') throw verificationUnavailable();
  const subject = subjectFromClaim(challenge);
  const code = provider.ownsCode
    ? undefined
    : provider.name === 'development'
      ? '000000'
      : generateConsumerOtp();
  const otpHash = code
    ? await hashConsumerOtp({
        challengeToken: input.challengeToken,
        code,
        secret: getOtpSecret(provider.name),
      })
    : null;
  const resendAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS);
  const provisionalExpiresAt = new Date(now.getTime() + challengeTtl(provider));
  const reserved = await getDb().consumerVerificationChallenge.updateMany({
    where: {
      id: challenge.id,
      status: 'PENDING',
      consumedAt: null,
      resendCount: challenge.resendCount,
      resendAfter: { lte: now },
    },
    data: {
      resendCount: { increment: 1 },
      resendAfter,
      expiresAt: provisionalExpiresAt,
      otpHash,
    },
  });
  if (reserved.count !== 1) throw new RateLimitError('Aguarde antes de reenviar.');

  let resent;
  try {
    resent = await provider.resend({
      subject,
      storeName: scope.name,
      code,
      idempotencyKey: `consumer-otp-resend/${challenge.id}/${challenge.resendCount + 1}`,
    });
  } catch (error) {
    await failChallengeAfterDeliveryError(challenge.id);
    throw error;
  }
  const expiresAt = new Date(
    Math.min(resent.expiresAt.getTime(), now.getTime() + challengeTtl(provider)),
  );
  await getDb().consumerVerificationChallenge.updateMany({
    where: { id: challenge.id, status: 'PENDING', consumedAt: null },
    data: { expiresAt },
  });
  return { expiresAt, resendAfter };
}

async function recordFailedAttempt(input: { challengeId: string; terminal: boolean }) {
  await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-challenge:${input.challengeId}`}, 0))`,
      );
      const current = await tx.consumerVerificationChallenge.findFirst({
        where: { id: input.challengeId, status: 'PENDING', consumedAt: null },
        select: { attemptCount: true },
      });
      if (!current) return;
      const nextAttempts = current.attemptCount + 1;
      await tx.consumerVerificationChallenge.update({
        where: { id: input.challengeId },
        data: {
          attemptCount: nextAttempts,
          status: input.terminal || nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function verifyConsumerCode(input: {
  storeSlug: string;
  challengeToken: string;
  code: string;
  deviceLabel?: string | null;
}) {
  const scope = assertFeatureEnabled(await getConsumerStoreScope(input.storeSlug));
  const challengeTokenHash = await hashConsumerSecret(input.challengeToken);
  const now = new Date();
  const challenge = await getDb().consumerVerificationChallenge.findFirst({
    where: {
      challengeTokenHash,
      tenantId: scope.tenantId,
      storeId: scope.id,
      status: 'PENDING',
      consumedAt: null,
      expiresAt: { gt: now },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
  });
  if (!challenge) throw new BusinessRuleError('Esta confirmação expirou. Solicite um novo código.');

  const provider = getConsumerVerificationProviderByName(challenge.provider);
  if (!provider.isReady() || provider.name === 'disabled') throw verificationUnavailable();
  let providerVerified = true;
  let providerTerminal = false;
  if (provider.ownsCode) {
    const verification = await provider.verify(subjectFromClaim(challenge), input.code);
    providerVerified = verification.verified;
    providerTerminal = verification.terminal;
  } else {
    providerVerified = Boolean(
      challenge.otpHash &&
      (await verifyConsumerOtpHash({
        challengeToken: input.challengeToken,
        code: input.code,
        secret: getOtpSecret(provider.name),
        otpHash: challenge.otpHash,
      })),
    );
  }
  if (!providerVerified) {
    await recordFailedAttempt({
      challengeId: challenge.id,
      terminal: providerTerminal,
    });
    throw new AuthenticationError('O código informado é inválido ou expirou.');
  }

  const sessionToken = createConsumerSecret();
  const sessionTokenHash = await hashConsumerSecret(sessionToken);
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const result = await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`consumer-challenge:${challenge.id}`}, 0)
        )
      `);
      const current = await tx.consumerVerificationChallenge.findFirst({
        where: {
          id: challenge.id,
          status: 'PENDING',
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: MAX_ATTEMPTS },
        },
      });
      if (!current) throw new ConflictError('Esta confirmação já foi utilizada.');

      if (!provider.ownsCode) {
        const currentCodeMatches = Boolean(
          current.otpHash &&
          (await verifyConsumerOtpHash({
            challengeToken: input.challengeToken,
            code: input.code,
            secret: getOtpSecret(provider.name),
            otpHash: current.otpHash,
          })),
        );
        if (!currentCodeMatches) {
          const nextAttempts = current.attemptCount + 1;
          await tx.consumerVerificationChallenge.update({
            where: { id: current.id },
            data: {
              attemptCount: nextAttempts,
              status: nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            },
          });
          return { invalid: true as const };
        }
      }

      let customer: {
        id: string;
        name: string;
        phoneNormalized: string;
        consumerIdentityId: string | null;
      } | null = null;
      if (current.claimCustomerId) {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`consumer-customer:${current.tenantId}:${current.claimCustomerId}`}, 0)
          )
        `);
        customer = await tx.customer.findFirst({
          where: { id: current.claimCustomerId, tenantId: current.tenantId },
          select: { id: true, name: true, phoneNormalized: true, consumerIdentityId: true },
        });
        if (
          !customer ||
          (current.phoneNormalized && customer.phoneNormalized !== current.phoneNormalized)
        ) {
          throw new BusinessRuleError('Não foi possível confirmar esta conta.');
        }
      }

      let identity: { id: string };
      if (current.emailNormalized) {
        const emailIdentity = await tx.consumerIdentity.findUnique({
          where: { emailNormalized: current.emailNormalized },
          select: { id: true },
        });
        if (customer?.consumerIdentityId) {
          if (emailIdentity && emailIdentity.id !== customer.consumerIdentityId) {
            throw new ConflictError('Não foi possível confirmar esta conta.');
          }
          const linkedIdentity = await tx.consumerIdentity.findUnique({
            where: { id: customer.consumerIdentityId },
            select: { id: true, emailNormalized: true },
          });
          if (
            !linkedIdentity ||
            (linkedIdentity.emailNormalized &&
              linkedIdentity.emailNormalized !== current.emailNormalized)
          ) {
            throw new ConflictError('Não foi possível confirmar esta conta.');
          }
          identity = await tx.consumerIdentity.update({
            where: { id: linkedIdentity.id },
            data: { emailNormalized: current.emailNormalized, emailVerifiedAt: now },
            select: { id: true },
          });
        } else {
          identity = await tx.consumerIdentity.upsert({
            where: { emailNormalized: current.emailNormalized },
            create: { emailNormalized: current.emailNormalized, emailVerifiedAt: now },
            update: { emailVerifiedAt: now },
            select: { id: true },
          });
        }
      } else if (current.phoneNormalized) {
        identity = await tx.consumerIdentity.upsert({
          where: { phoneNormalized: current.phoneNormalized },
          create: { phoneNormalized: current.phoneNormalized, phoneVerifiedAt: now },
          update: { phoneVerifiedAt: now },
          select: { id: true },
        });
      } else {
        throw new BusinessRuleError('Não foi possível confirmar esta conta.');
      }

      let customerName: string | null = null;
      if (customer) {
        const conflictingLink = await tx.customer.findFirst({
          where: {
            tenantId: current.tenantId,
            consumerIdentityId: identity.id,
            id: { not: customer.id },
          },
          select: { id: true },
        });
        if (
          conflictingLink ||
          (customer.consumerIdentityId && customer.consumerIdentityId !== identity.id)
        ) {
          throw new ConflictError('Não foi possível confirmar esta conta.');
        }
        const proof =
          current.purpose === 'ORDER_CLAIM' ? 'ORDER_PUBLIC_TOKEN' : 'DEVICE_RECOGNITION';
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            consumerIdentityId: identity.id,
            consumerIdentityLinkedAt: now,
            consumerIdentityLinkProof: proof,
          },
        });
        customerName = customer.name;
      }

      await tx.consumerSession.create({
        data: {
          consumerIdentityId: identity.id,
          tokenHash: sessionTokenHash,
          expiresAt: sessionExpiresAt,
          deviceLabel: input.deviceLabel?.trim().slice(0, 80) || null,
        },
      });
      const excessSessions = await tx.consumerSession.findMany({
        where: {
          consumerIdentityId: identity.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: MAX_ACTIVE_SESSIONS,
        select: { id: true },
      });
      if (excessSessions.length > 0) {
        await tx.consumerSession.updateMany({
          where: { id: { in: excessSessions.map((session) => session.id) }, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      await tx.consumerVerificationChallenge.update({
        where: { id: current.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: now,
          consumedAt: now,
          consumerIdentityId: identity.id,
          attemptCount: { increment: 1 },
        },
      });
      return {
        invalid: false as const,
        linked: Boolean(customer),
        customerName,
        loyaltyClaim: customer
          ? { tenantId: current.tenantId, storeId: current.storeId, customerId: customer.id }
          : null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (result.invalid) throw new AuthenticationError('O código informado é inválido ou expirou.');
  if (result.loyaltyClaim) {
    try {
      await getDb().$transaction((tx) => processClaimedDeliveredOrders(tx, result.loyaltyClaim!));
    } catch (error) {
      console.error('[LOYALTY_SAFE_CLAIM_FAILED]', {
        storeId: result.loyaltyClaim.storeId,
        error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
      });
    }
  }
  return {
    sessionToken,
    expiresAt: sessionExpiresAt,
    invalid: result.invalid,
    linked: result.linked,
    customerName: result.customerName,
  };
}

export async function getCurrentConsumer(input: {
  sessionToken?: string | null;
  tenantId?: string;
  storeId?: string;
}) {
  if (!isConsumerSecret(input.sessionToken)) return null;
  const tokenHash = await hashConsumerSecret(input.sessionToken);
  const now = new Date();
  const session = await getDb().consumerSession.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      expiresAt: true,
      lastUsedAt: true,
      consumerIdentity: {
        select: {
          id: true,
          phoneNormalized: true,
          emailNormalized: true,
          customers: {
            where: { tenantId: input.tenantId ?? '__no_tenant_scope__' },
            take: 1,
            select: {
              id: true,
              tenantId: true,
              name: true,
              phoneNormalized: true,
              addresses: {
                orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
                take: 1,
                select: {
                  street: true,
                  number: true,
                  complement: true,
                  reference: true,
                  zipCode: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!session) return null;
  if (session.lastUsedAt.getTime() <= now.getTime() - SESSION_ACTIVITY_TOUCH_MS) {
    await getDb().consumerSession.updateMany({
      where: { id: session.id, revokedAt: null, lastUsedAt: session.lastUsedAt },
      data: { lastUsedAt: now },
    });
  }
  const customer =
    input.tenantId && input.storeId ? (session.consumerIdentity.customers?.[0] ?? null) : null;
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    identityId: session.consumerIdentity.id,
    phoneNormalized: customer?.phoneNormalized ?? session.consumerIdentity.phoneNormalized,
    emailNormalized: session.consumerIdentity.emailNormalized,
    customer,
  };
}

export async function requireConsumerForStore(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const scope = assertFeatureEnabled(await getConsumerStoreScope(input.storeSlug));
  const consumer = await getCurrentConsumer({
    sessionToken: input.sessionToken,
    tenantId: scope.tenantId,
    storeId: scope.id,
  });
  if (!consumer) throw new AuthenticationError();
  return { scope, consumer };
}

export async function logoutConsumer(sessionToken?: string | null) {
  if (!isConsumerSecret(sessionToken)) return;
  const tokenHash = await hashConsumerSecret(sessionToken);
  await getDb().consumerSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function requestConsumerEmailChange(input: {
  storeSlug: string;
  sessionToken?: string | null;
  newEmailNormalized: string;
  requestIpHash?: string | null;
}) {
  const { scope, consumer } = await requireConsumerForStore(input);
  if (!scope.entitlement?.consumerConvenienceV2Enabled) throw new NotFoundError('Página');
  const currentEmail = consumer.emailNormalized;
  if (!currentEmail || currentEmail === input.newEmailNormalized) {
    throw new BusinessRuleError('Informe um novo e-mail válido.');
  }
  const provider = getConsumerVerificationProvider();
  if (!provider.isReady() || provider.method !== 'email' || provider.ownsCode) {
    throw verificationUnavailable();
  }
  const now = new Date();
  const requestId = randomUUID();
  const challengeId = randomUUID();
  const challengeToken = createConsumerSecret();
  const challengeTokenHash = await hashConsumerSecret(challengeToken);
  const currentEmailHash = await hashConsumerSecret(
    `${getOtpSecret(provider.name)}:${currentEmail}`,
  );
  const code = provider.name === 'development' ? '000000' : generateConsumerOtp();
  const otpHash = await hashConsumerOtp({
    challengeToken,
    code,
    secret: getOtpSecret(provider.name),
  });
  const expiresAt = new Date(now.getTime() + EMAIL_CHALLENGE_TTL_MS);
  const resendAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS);

  await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-email-change:${consumer.identityId}`}, 0))`,
      );
      await tx.consumerEmailChangeRequest.updateMany({
        where: {
          consumerIdentityId: consumer.identityId,
          status: { in: ['PENDING', 'CURRENT_VERIFIED'] },
        },
        data: { status: 'CANCELLED' },
      });
      await tx.consumerEmailChangeRequest.create({
        data: {
          id: requestId,
          consumerIdentityId: consumer.identityId,
          initiatedBySessionId: consumer.sessionId,
          currentEmailHash,
          newEmailNormalized: input.newEmailNormalized,
          expiresAt,
        },
      });
      await tx.consumerVerificationChallenge.create({
        data: {
          id: challengeId,
          challengeTokenHash,
          tenantId: scope.tenantId,
          storeId: scope.id,
          emailNormalized: input.newEmailNormalized,
          otpHash,
          purpose: 'EMAIL_CHANGE_NEW',
          provider: provider.name,
          consumerIdentityId: consumer.identityId,
          emailChangeRequestId: requestId,
          requestIpHash: input.requestIpHash ?? null,
          resendAfter,
          expiresAt,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  try {
    await provider.start({
      subject: { kind: 'email', normalized: input.newEmailNormalized },
      storeName: scope.name,
      code,
      idempotencyKey: `consumer-email-change/${requestId}`,
    });
  } catch (error) {
    await getDb().$transaction([
      getDb().consumerVerificationChallenge.updateMany({
        where: { id: challengeId, status: 'PENDING' },
        data: { status: 'FAILED' },
      }),
      getDb().consumerEmailChangeRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'FAILED' },
      }),
    ]);
    throw error;
  }
  return { challengeToken, expiresAt, resendAfter };
}

export async function confirmConsumerEmailChange(input: {
  storeSlug: string;
  sessionToken?: string | null;
  challengeToken: string;
  code: string;
}) {
  const { scope, consumer } = await requireConsumerForStore(input);
  if (!scope.entitlement?.consumerConvenienceV2Enabled) throw new NotFoundError('Página');
  const challengeTokenHash = await hashConsumerSecret(input.challengeToken);
  const now = new Date();
  const challenge = await getDb().consumerVerificationChallenge.findFirst({
    where: {
      challengeTokenHash,
      tenantId: scope.tenantId,
      storeId: scope.id,
      consumerIdentityId: consumer.identityId,
      purpose: 'EMAIL_CHANGE_NEW',
      status: 'PENDING',
      consumedAt: null,
      expiresAt: { gt: now },
      attemptCount: { lt: MAX_ATTEMPTS },
      emailChangeRequest: {
        consumerIdentityId: consumer.identityId,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
    },
    select: { id: true, provider: true, otpHash: true },
  });
  if (!challenge) throw new BusinessRuleError('Esta confirmação expirou. Solicite uma nova.');
  const provider = getConsumerVerificationProviderByName(challenge.provider);
  const matches = Boolean(
    challenge.otpHash &&
    (await verifyConsumerOtpHash({
      challengeToken: input.challengeToken,
      code: input.code,
      secret: getOtpSecret(provider.name),
      otpHash: challenge.otpHash,
    })),
  );
  if (!matches) {
    await recordFailedAttempt({ challengeId: challenge.id, terminal: false });
    throw new AuthenticationError('O código informado é inválido ou expirou.');
  }

  const nextSessionToken = createConsumerSecret();
  const nextSessionTokenHash = await hashConsumerSecret(nextSessionToken);
  const nextExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-email-change:${consumer.identityId}`}, 0))`,
      );
      const current = await tx.consumerVerificationChallenge.findFirst({
        where: {
          id: challenge.id,
          consumerIdentityId: consumer.identityId,
          purpose: 'EMAIL_CHANGE_NEW',
          status: 'PENDING',
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: MAX_ATTEMPTS },
        },
        select: {
          id: true,
          otpHash: true,
          emailChangeRequest: {
            select: {
              id: true,
              consumerIdentityId: true,
              currentEmailHash: true,
              newEmailNormalized: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      });
      const change = current?.emailChangeRequest;
      const currentIdentity = await tx.consumerIdentity.findUnique({
        where: { id: consumer.identityId },
        select: { emailNormalized: true },
      });
      if (
        !current?.otpHash ||
        !change ||
        change.consumerIdentityId !== consumer.identityId ||
        change.status !== 'PENDING' ||
        change.expiresAt <= now ||
        !currentIdentity?.emailNormalized ||
        (await hashConsumerSecret(
          `${getOtpSecret(provider.name)}:${currentIdentity.emailNormalized}`,
        )) !== change.currentEmailHash ||
        !(await verifyConsumerOtpHash({
          challengeToken: input.challengeToken,
          code: input.code,
          secret: getOtpSecret(provider.name),
          otpHash: current.otpHash,
        }))
      ) {
        throw new ConflictError('Não foi possível alterar o e-mail. Solicite um novo código.');
      }
      const conflict = await tx.consumerIdentity.findUnique({
        where: { emailNormalized: change.newEmailNormalized },
        select: { id: true },
      });
      if (conflict && conflict.id !== consumer.identityId) {
        throw new ConflictError('Não foi possível alterar o e-mail.');
      }
      const updated = await tx.consumerIdentity.updateMany({
        where: { id: consumer.identityId, emailNormalized: currentIdentity.emailNormalized },
        data: { emailNormalized: change.newEmailNormalized, emailVerifiedAt: now },
      });
      if (updated.count !== 1) throw new ConflictError('Não foi possível alterar o e-mail.');
      await tx.consumerEmailChangeRequest.update({
        where: { id: change.id },
        data: { status: 'COMPLETED', newVerifiedAt: now, completedAt: now },
      });
      await tx.consumerVerificationChallenge.update({
        where: { id: current.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: now,
          consumedAt: now,
          attemptCount: { increment: 1 },
        },
      });
      await tx.consumerSession.updateMany({
        where: {
          consumerIdentityId: consumer.identityId,
          id: { not: consumer.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      const rotated = await tx.consumerSession.updateMany({
        where: {
          id: consumer.sessionId,
          consumerIdentityId: consumer.identityId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          tokenHash: nextSessionTokenHash,
          expiresAt: nextExpiresAt,
          lastUsedAt: now,
        },
      });
      if (rotated.count !== 1) throw new ConflictError('Não foi possível alterar o e-mail.');
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return { sessionToken: nextSessionToken, expiresAt: nextExpiresAt };
}

export function describeConsumerDevice(userAgent: string | null) {
  const value = userAgent ?? '';
  const browser = /Edg\//u.test(value)
    ? 'Edge'
    : /Firefox\//u.test(value)
      ? 'Firefox'
      : /CriOS\//u.test(value)
        ? 'Chrome'
        : /Chrome\//u.test(value)
          ? 'Chrome'
          : /Safari\//u.test(value)
            ? 'Safari'
            : 'Navegador';
  const platform = /iPhone|iPad/u.test(value)
    ? 'iPhone/iPad'
    : /Android/u.test(value)
      ? 'Android'
      : /Windows/u.test(value)
        ? 'Windows'
        : /Macintosh/u.test(value)
          ? 'Mac'
          : null;
  return platform ? `${browser} no ${platform}` : browser;
}

export function readCookieHeader(request: Request, name: string) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

export function getConsumerDeviceToken(request: Request) {
  return readCookieHeader(request, getStorefrontDeviceCookieName());
}
