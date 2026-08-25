import 'server-only';

import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

import type { ConsumerVerificationRequest } from '@/schemas/consumer-auth';
import { getDb } from '@/server/database/client';
import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  getConsumerVerificationProvider,
  getConsumerVerificationProviderByName,
} from '@/server/consumer-verification/provider';
import {
  getStorefrontDeviceCookieName,
  hashStorefrontDeviceToken,
  isStorefrontDeviceToken,
} from '@/server/services/customer-device-recognition.service';

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const MAX_ATTEMPTS = 5;

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
      entitlement: { select: { consumerIdentityEnabled: true } },
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
  deviceToken?: string | null;
}) {
  const { request } = input;
  if (request.purpose === 'LOGIN') {
    if (!request.phone) throw new BusinessRuleError('Não foi possível iniciar a confirmação.');
    return { customerId: null, orderId: null, phoneNormalized: request.phone };
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
    const phoneNormalized = order?.customer?.phoneNormalized ?? order?.customerPhoneNormalized;
    if (
      !order?.customerId ||
      !phoneNormalized ||
      (request.phone && phoneNormalized !== request.phone)
    ) {
      throw new BusinessRuleError(
        'Não foi possível confirmar este pedido com os dados informados.',
      );
    }
    return { customerId: order.customerId, orderId: order.id, phoneNormalized };
  }

  if (!request.phone) throw new BusinessRuleError('Não foi possível confirmar este aparelho.');
  if (!isStorefrontDeviceToken(input.deviceToken)) {
    throw new BusinessRuleError('Não foi possível confirmar este aparelho.');
  }
  const deviceHash = await hashStorefrontDeviceToken(input.deviceToken);
  const recognition = await getDb().customerDeviceRecognition.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      storefrontDevice: { tokenHash: deviceHash, expiresAt: { gt: new Date() } },
      customer: { phoneNormalized: request.phone },
    },
    select: { customerId: true },
  });
  if (!recognition) throw new BusinessRuleError('Não foi possível confirmar este aparelho.');
  return { customerId: recognition.customerId, orderId: null, phoneNormalized: request.phone };
}

export async function resolveConsumerVerificationContext(input: {
  storeSlug: string;
  request: ConsumerVerificationRequest;
  deviceToken?: string | null;
}) {
  const scope = assertFeatureEnabled(await getConsumerStoreScope(input.storeSlug));
  const claim = await resolveClaim({
    tenantId: scope.tenantId,
    storeId: scope.id,
    request: input.request,
    deviceToken: input.deviceToken,
  });
  return { scope, claim, phoneNormalized: claim.phoneNormalized, request: input.request };
}

export async function requestConsumerVerification(input: {
  context: Awaited<ReturnType<typeof resolveConsumerVerificationContext>>;
}) {
  const { scope, claim, phoneNormalized, request } = input.context;
  const provider = getConsumerVerificationProvider();
  if (!provider.isReady()) {
    throw new BusinessRuleError(
      'A confirmação por celular está temporariamente indisponível. Tente novamente mais tarde.',
    );
  }
  const started = await provider.start(phoneNormalized);
  const challengeToken = createConsumerSecret();
  const challengeTokenHash = await hashConsumerSecret(challengeToken);
  const now = new Date();
  const expiresAt = new Date(Math.min(started.expiresAt.getTime(), now.getTime() + 5 * 60 * 1_000));

  await getDb().consumerVerificationChallenge.create({
    data: {
      challengeTokenHash,
      tenantId: scope.tenantId,
      storeId: scope.id,
      phoneNormalized,
      purpose: request.purpose,
      provider: started.provider,
      claimCustomerId: claim.customerId,
      claimOrderId: claim.orderId,
      resendAfter: new Date(now.getTime() + RESEND_COOLDOWN_MS),
      expiresAt,
    },
  });

  return {
    challengeToken,
    expiresAt,
    resendAfter: new Date(now.getTime() + RESEND_COOLDOWN_MS),
  };
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
  const resent = await getConsumerVerificationProviderByName(challenge.provider).resend(
    challenge.phoneNormalized,
  );
  const expiresAt = new Date(Math.min(resent.expiresAt.getTime(), now.getTime() + 5 * 60 * 1_000));
  const resendAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS);
  await getDb().consumerVerificationChallenge.update({
    where: { id: challenge.id },
    data: {
      resendCount: { increment: 1 },
      resendAfter,
      expiresAt,
    },
  });
  return { expiresAt, resendAfter };
}

export async function verifyConsumerCode(input: {
  storeSlug: string;
  challengeToken: string;
  code: string;
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

  const verified = await getConsumerVerificationProviderByName(challenge.provider).verify(
    challenge.phoneNormalized,
    input.code,
  );
  if (!verified.verified) {
    const nextAttempts = challenge.attemptCount + 1;
    await getDb().consumerVerificationChallenge.updateMany({
      where: { id: challenge.id, status: 'PENDING', consumedAt: null },
      data: {
        attemptCount: nextAttempts,
        status: verified.terminal || nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
      },
    });
    throw new AuthenticationError('O código informado é inválido ou expirou.');
  }

  const sessionToken = createConsumerSecret();
  const sessionTokenHash = await hashConsumerSecret(sessionToken);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const result = await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`consumer-challenge:${challenge.id}`}, 0)
        )
      `);
      const current = await tx.consumerVerificationChallenge.findFirst({
        where: { id: challenge.id, status: 'PENDING', consumedAt: null, expiresAt: { gt: now } },
      });
      if (!current) throw new ConflictError('Esta confirmação já foi utilizada.');

      const identity = await tx.consumerIdentity.upsert({
        where: { phoneNormalized: current.phoneNormalized },
        create: { phoneNormalized: current.phoneNormalized, phoneVerifiedAt: now },
        update: { phoneVerifiedAt: now },
        select: { id: true },
      });

      let customerName: string | null = null;
      if (current.claimCustomerId) {
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`consumer-customer:${current.tenantId}:${current.claimCustomerId}`}, 0)
          )
        `);
        const customer = await tx.customer.findFirst({
          where: { id: current.claimCustomerId, tenantId: current.tenantId },
          select: { id: true, name: true, phoneNormalized: true, consumerIdentityId: true },
        });
        if (!customer || customer.phoneNormalized !== current.phoneNormalized) {
          throw new BusinessRuleError('Não foi possível confirmar esta conta.');
        }
        if (customer.consumerIdentityId && customer.consumerIdentityId !== identity.id) {
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

      await tx.consumerSession.updateMany({
        where: { consumerIdentityId: identity.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.consumerSession.create({
        data: { consumerIdentityId: identity.id, tokenHash: sessionTokenHash, expiresAt },
      });
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
      return { linked: Boolean(current.claimCustomerId), customerName };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { sessionToken, expiresAt, ...result };
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
      consumerIdentity: {
        select: {
          id: true,
          phoneNormalized: true,
          customers: {
            where: { tenantId: input.tenantId ?? '__no_tenant_scope__' },
            take: 1,
            select: {
              id: true,
              tenantId: true,
              name: true,
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
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    identityId: session.consumerIdentity.id,
    phoneNormalized: session.consumerIdentity.phoneNormalized,
    customer:
      input.tenantId && input.storeId ? (session.consumerIdentity.customers?.[0] ?? null) : null,
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
