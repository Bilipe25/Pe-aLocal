import 'server-only';

import type { PaymentProviderConnectionStatus } from '@prisma/client';

import { requireAuthenticatedUser, requireTenantStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  exchangeMercadoPagoAuthorizationCode,
  MercadoPagoApiError,
  refreshMercadoPagoToken,
} from '@/lib/mercado-pago/client';
import {
  assertMercadoPagoOAuthEnvironment,
  getMercadoPagoConfig,
  isMercadoPagoEnabled,
  MERCADO_PAGO_AUTH_ORIGIN,
  MercadoPagoOAuthEnvironmentMismatchError,
} from '@/lib/mercado-pago/config';
import {
  createPkceChallenge,
  credentialAad,
  decryptCredential,
  encryptCredential,
  randomBase64Url,
  sha256Hex,
} from '@/lib/mercado-pago/crypto';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_LEASE_MS = 30 * 1000;

function environmentMismatchMessage(expectedEnvironment: 'sandbox' | 'production') {
  return expectedEnvironment === 'sandbox'
    ? 'Não foi possível concluir a conexão Mercado Pago no ambiente de teste.'
    : 'Não foi possível concluir a conexão Mercado Pago no ambiente de produção.';
}

function logEnvironmentMismatch(input: {
  expectedEnvironment: 'sandbox' | 'production';
  receivedLiveMode: boolean;
  storeId: string;
  tenantId: string;
}) {
  console.error('[MERCADO_PAGO_OAUTH_ENVIRONMENT_MISMATCH]', input);
}

function assertOnlinePaymentsEnabled(entitlement: { onlinePaymentsEnabled: boolean } | null) {
  if (!isMercadoPagoEnabled() || !entitlement?.onlinePaymentsEnabled) {
    throw new BusinessRuleError('O pagamento online não está disponível para esta loja.');
  }
}

interface MercadoPagoCapabilitySource {
  entitlement: { onlinePaymentsEnabled: boolean } | null;
  settings: { paymentMode: 'MANUAL' | 'ONLINE' } | null;
  paymentProviderConnections: Array<{
    status: PaymentProviderConnectionStatus;
    liveMode: boolean;
    connectedAt: Date | null;
    refreshedAt: Date | null;
    reauthRequiredAt: Date | null;
  }>;
}

export function resolveMercadoPagoCapability(
  store: MercadoPagoCapabilitySource,
  rolloutEnabled: boolean,
) {
  if (!rolloutEnabled || !store.entitlement?.onlinePaymentsEnabled) return null;

  const connection = store.paymentProviderConnections[0] ?? null;
  const mode = store.settings?.paymentMode ?? 'MANUAL';
  const canSelectOnline = connection?.status === 'ACTIVE';

  return {
    mode,
    effectiveMode: mode === 'ONLINE' && canSelectOnline ? ('ONLINE' as const) : ('MANUAL' as const),
    connection,
    canSelectOnline,
  } as const;
}

export async function getMercadoPagoCapability(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_PAYMENT_SETTINGS);
  const store = await getDb().store.findFirst({
    where: { id: storeId, tenantId: session.tenantId },
    select: {
      entitlement: { select: { onlinePaymentsEnabled: true } },
      settings: { select: { paymentMode: true } },
      paymentProviderConnections: {
        where: { provider: 'MERCADO_PAGO' },
        take: 1,
        select: {
          status: true,
          liveMode: true,
          connectedAt: true,
          refreshedAt: true,
          reauthRequiredAt: true,
        },
      },
    },
  });
  if (!store) throw new NotFoundError('Loja');
  return resolveMercadoPagoCapability(store, isMercadoPagoEnabled());
}

export async function startMercadoPagoOAuth(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.EDIT_PAYMENT_SETTINGS);
  const store = await getDb().store.findFirst({
    where: { id: storeId, tenantId: session.tenantId },
    select: { entitlement: { select: { onlinePaymentsEnabled: true } } },
  });
  if (!store) throw new NotFoundError('Loja');
  assertOnlinePaymentsEnabled(store.entitlement);

  const config = getMercadoPagoConfig();
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(64);
  const [stateHash, challenge, encryptedVerifier] = await Promise.all([
    sha256Hex(state),
    createPkceChallenge(verifier),
    encryptCredential(
      verifier,
      config.encryptionKey,
      credentialAad({
        tenantId: session.tenantId,
        storeId,
        provider: 'MERCADO_PAGO',
        kind: 'pkce_verifier',
      }),
    ),
  ]);
  const returnPath = `/dashboard/stores/${encodeURIComponent(storeId)}/payments`;
  await getDb().paymentProviderOAuthAttempt.create({
    data: {
      tenantId: session.tenantId,
      storeId,
      provider: 'MERCADO_PAGO',
      initiatedById: session.userId,
      stateHash,
      codeVerifierCiphertext: encryptedVerifier.ciphertext,
      codeVerifierIv: encryptedVerifier.iv,
      returnPath,
      expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
    },
  });
  console.info('[MP_OAUTH_STARTED]', { storeId });

  const authorizationUrl = new URL('/authorization', MERCADO_PAGO_AUTH_ORIGIN);
  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('platform_id', 'mp');
  authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('scope', 'offline_access read write');
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  return authorizationUrl.toString();
}

export async function completeMercadoPagoOAuth(state: string, code: string) {
  const session = await requireAuthenticatedUser();
  if (!session.tenantId || !state || !code) {
    throw new BusinessRuleError('Não foi possível concluir a conexão com o Mercado Pago.');
  }
  const config = getMercadoPagoConfig();
  const stateHash = await sha256Hex(state);
  const attempt = await getDb().paymentProviderOAuthAttempt.findUnique({
    where: { stateHash },
    include: { store: { select: { entitlement: { select: { onlinePaymentsEnabled: true } } } } },
  });
  if (
    !attempt ||
    attempt.consumedAt ||
    attempt.expiresAt <= new Date() ||
    attempt.initiatedById !== session.userId ||
    attempt.tenantId !== session.tenantId ||
    !attempt.codeVerifierCiphertext ||
    !attempt.codeVerifierIv
  ) {
    throw new BusinessRuleError('Esta tentativa de conexão expirou ou já foi utilizada.');
  }
  assertOnlinePaymentsEnabled(attempt.store.entitlement);

  const verifier = await decryptCredential(
    { ciphertext: attempt.codeVerifierCiphertext, iv: attempt.codeVerifierIv },
    config.encryptionKey,
    credentialAad({
      tenantId: attempt.tenantId,
      storeId: attempt.storeId,
      provider: 'MERCADO_PAGO',
      kind: 'pkce_verifier',
      version: attempt.credentialVersion,
    }),
  );
  const claimed = await getDb().paymentProviderOAuthAttempt.updateMany({
    where: { id: attempt.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date(), codeVerifierCiphertext: null, codeVerifierIv: null },
  });
  if (claimed.count !== 1) throw new ConflictError('A conexão já está sendo concluída.');

  const token = await exchangeMercadoPagoAuthorizationCode({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    code,
    codeVerifier: verifier,
    testToken: config.oauthTestMode,
  });
  try {
    assertMercadoPagoOAuthEnvironment(token.live_mode, config.oauthEnvironment);
  } catch (error) {
    if (error instanceof MercadoPagoOAuthEnvironmentMismatchError) {
      logEnvironmentMismatch({
        expectedEnvironment: error.expectedEnvironment,
        receivedLiveMode: error.receivedLiveMode,
        storeId: attempt.storeId,
        tenantId: attempt.tenantId,
      });
      await getDb().storePaymentProviderConnection.updateMany({
        where: {
          tenantId: attempt.tenantId,
          storeId: attempt.storeId,
          provider: 'MERCADO_PAGO',
        },
        data: { status: 'ERROR', lastErrorCode: error.code },
      });
      throw new BusinessRuleError(environmentMismatchMessage(error.expectedEnvironment));
    }
    throw error;
  }
  const [access, refresh] = await Promise.all([
    encryptCredential(
      token.access_token,
      config.encryptionKey,
      credentialAad({
        tenantId: attempt.tenantId,
        storeId: attempt.storeId,
        provider: 'MERCADO_PAGO',
        kind: 'access_token',
      }),
    ),
    encryptCredential(
      token.refresh_token,
      config.encryptionKey,
      credentialAad({
        tenantId: attempt.tenantId,
        storeId: attempt.storeId,
        provider: 'MERCADO_PAGO',
        kind: 'refresh_token',
      }),
    ),
  ]);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + token.expires_in * 1000);
  const scopes = token.scope.split(/\s+/u).filter(Boolean);
  if (!scopes.includes('read') || !scopes.includes('write')) {
    throw new BusinessRuleError('A autorização não concedeu as permissões necessárias.');
  }
  return getDb().$transaction(async (tx) => {
    const connection = await tx.storePaymentProviderConnection.upsert({
      where: { storeId_provider: { storeId: attempt.storeId, provider: 'MERCADO_PAGO' } },
      update: {
        status: 'ACTIVE',
        providerUserId: token.user_id,
        liveMode: token.live_mode,
        scopes,
        accessTokenCiphertext: access.ciphertext,
        accessTokenIv: access.iv,
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenIv: refresh.iv,
        tokenExpiresAt: expiresAt,
        connectedAt: now,
        refreshedAt: now,
        disconnectedAt: null,
        reauthRequiredAt: null,
        lastErrorCode: null,
      },
      create: {
        tenantId: attempt.tenantId,
        storeId: attempt.storeId,
        provider: 'MERCADO_PAGO',
        status: 'ACTIVE',
        providerUserId: token.user_id,
        liveMode: token.live_mode,
        scopes,
        accessTokenCiphertext: access.ciphertext,
        accessTokenIv: access.iv,
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenIv: refresh.iv,
        tokenExpiresAt: expiresAt,
        connectedAt: now,
        refreshedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: attempt.tenantId,
        storeId: attempt.storeId,
        userId: session.userId,
        action: 'PAYMENT_PROVIDER_CONNECTED',
        entity: 'StorePaymentProviderConnection',
        entityId: connection.id,
        metadata: { provider: 'MERCADO_PAGO', liveMode: token.live_mode, scopes },
      },
    });
    console.info('[MP_OAUTH_CONNECTED]', { storeId: attempt.storeId, liveMode: token.live_mode });
    return { returnPath: attempt.returnPath };
  });
}

export async function disconnectMercadoPago(storeId: string, expectedConfigurationVersion: number) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.EDIT_PAYMENT_SETTINGS);
  return getDb().$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: storeId,
        tenantId: session.tenantId,
        configurationVersion: expectedConfigurationVersion,
      },
      select: { slug: true },
    });
    if (!store) {
      throw new ConflictError('As configurações foram alteradas. Recarregue a página.');
    }
    const connection = await tx.storePaymentProviderConnection.findFirst({
      where: { tenantId: session.tenantId, storeId, provider: 'MERCADO_PAGO' },
    });
    if (!connection) throw new NotFoundError('Conexão Mercado Pago');
    const advanced = await tx.store.updateMany({
      where: {
        id: storeId,
        tenantId: session.tenantId,
        configurationVersion: expectedConfigurationVersion,
      },
      data: { configurationVersion: { increment: 1 } },
    });
    if (advanced.count !== 1) {
      throw new ConflictError('As configurações foram alteradas. Recarregue a página.');
    }
    const pendingPayments = await tx.mercadoPagoPayment.count({
      where: { connectionId: connection.id, payment: { status: 'PENDING' } },
    });
    const updated = await tx.storePaymentProviderConnection.update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
        lastErrorCode: null,
        ...(pendingPayments > 0
          ? {}
          : {
              accessTokenCiphertext: null,
              accessTokenIv: null,
              refreshTokenCiphertext: null,
              refreshTokenIv: null,
              tokenExpiresAt: null,
            }),
      },
    });
    await tx.storeSettings.updateMany({ where: { storeId }, data: { paymentMode: 'MANUAL' } });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        storeId,
        userId: session.userId,
        action: 'PAYMENT_PROVIDER_DISCONNECTED',
        entity: 'StorePaymentProviderConnection',
        entityId: updated.id,
        metadata: {
          provider: 'MERCADO_PAGO',
          credentialsRetainedForPendingPayments: pendingPayments > 0,
        },
      },
    });
    return {
      connection: updated,
      storeId,
      storeSlug: store.slug,
      configurationVersion: expectedConfigurationVersion + 1,
    };
  });
}

export async function updateStorePaymentMode(
  storeId: string,
  expectedConfigurationVersion: number,
  mode: 'MANUAL' | 'ONLINE',
) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.EDIT_PAYMENT_SETTINGS,
  );
  return getDb().$transaction(async (tx) => {
    const current = await tx.store.findFirst({
      where: {
        id: storeId,
        tenantId: session.tenantId,
        configurationVersion: expectedConfigurationVersion,
      },
      select: {
        slug: true,
        entitlement: { select: { onlinePaymentsEnabled: true } },
        settings: { select: { paymentMode: true } },
        paymentProviderConnections: {
          where: { provider: 'MERCADO_PAGO' },
          take: 1,
          select: { status: true },
        },
      },
    });
    if (!current) throw new ConflictError('As configurações foram alteradas. Recarregue a página.');
    if (mode === 'ONLINE') {
      assertOnlinePaymentsEnabled(current.entitlement);
      if (current.paymentProviderConnections[0]?.status !== 'ACTIVE') {
        throw new BusinessRuleError('Conecte sua conta Mercado Pago antes de ativar o online.');
      }
    }
    const advanced = await tx.store.updateMany({
      where: {
        id: storeId,
        tenantId: session.tenantId,
        configurationVersion: expectedConfigurationVersion,
      },
      data: { configurationVersion: { increment: 1 } },
    });
    if (advanced.count !== 1)
      throw new ConflictError('As configurações foram alteradas. Recarregue a página.');
    await tx.storeSettings.upsert({
      where: { storeId },
      update: { paymentMode: mode },
      create: { storeId, paymentMode: mode },
    });
    await tx.auditLog.create({
      data: {
        tenantId: session.tenantId,
        storeId,
        userId: session.userId,
        action: 'UPDATE',
        entity: 'StoreSettings',
        entityId: storeId,
        metadata: {
          section: 'payment-mode',
          previousMode: current.settings?.paymentMode ?? 'MANUAL',
          nextMode: mode,
          expectedConfigurationVersion,
        },
      },
    });
    return {
      storeId: store.id,
      storeSlug: current.slug,
      configurationVersion: expectedConfigurationVersion + 1,
    };
  });
}

export async function markMercadoPagoReauthRequired(connectionId: string, code: string) {
  await getDb().storePaymentProviderConnection.updateMany({
    where: { id: connectionId },
    data: {
      status: 'REAUTH_REQUIRED',
      reauthRequiredAt: new Date(),
      lastErrorCode: code.slice(0, 64),
      refreshLeaseId: null,
      refreshLeaseExpiresAt: null,
    },
  });
}

export async function getMercadoPagoAccessToken(
  connectionId: string,
  options: { forceRefresh?: boolean; allowReconciliation?: boolean } = {},
): Promise<string> {
  const config = getMercadoPagoConfig();
  const connection = await getDb().storePaymentProviderConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || !connection.accessTokenCiphertext || !connection.accessTokenIv) {
    throw new BusinessRuleError('A conexão Mercado Pago precisa ser refeita.');
  }
  try {
    assertMercadoPagoOAuthEnvironment(connection.liveMode, config.oauthEnvironment);
  } catch (error) {
    if (error instanceof MercadoPagoOAuthEnvironmentMismatchError) {
      logEnvironmentMismatch({
        expectedEnvironment: error.expectedEnvironment,
        receivedLiveMode: error.receivedLiveMode,
        storeId: connection.storeId,
        tenantId: connection.tenantId,
      });
      await getDb().storePaymentProviderConnection.updateMany({
        where: { id: connection.id },
        data: { status: 'ERROR', lastErrorCode: error.code },
      });
      throw new BusinessRuleError(environmentMismatchMessage(error.expectedEnvironment));
    }
    throw error;
  }
  const allowedStatuses: PaymentProviderConnectionStatus[] = options.allowReconciliation
    ? ['ACTIVE', 'DISCONNECTED', 'ERROR', 'REAUTH_REQUIRED']
    : ['ACTIVE'];
  if (!allowedStatuses.includes(connection.status)) {
    throw new BusinessRuleError('A conta Mercado Pago não está conectada.');
  }
  const needsRefresh =
    options.forceRefresh ||
    !connection.tokenExpiresAt ||
    connection.tokenExpiresAt.getTime() <= Date.now() + REFRESH_MARGIN_MS;
  if (!needsRefresh) {
    return decryptCredential(
      { ciphertext: connection.accessTokenCiphertext, iv: connection.accessTokenIv },
      config.encryptionKey,
      credentialAad({
        tenantId: connection.tenantId,
        storeId: connection.storeId,
        provider: 'MERCADO_PAGO',
        kind: 'access_token',
        version: connection.credentialVersion,
      }),
    );
  }
  if (!connection.refreshTokenCiphertext || !connection.refreshTokenIv) {
    await markMercadoPagoReauthRequired(connection.id, 'MISSING_REFRESH_TOKEN');
    throw new BusinessRuleError('Reconecte a conta Mercado Pago.');
  }

  const leaseId = crypto.randomUUID();
  const lease = await getDb().storePaymentProviderConnection.updateMany({
    where: {
      id: connection.id,
      OR: [{ refreshLeaseExpiresAt: null }, { refreshLeaseExpiresAt: { lt: new Date() } }],
    },
    data: {
      refreshLeaseId: leaseId,
      refreshLeaseExpiresAt: new Date(Date.now() + REFRESH_LEASE_MS),
    },
  });
  if (lease.count !== 1) {
    const current = await getDb().storePaymentProviderConnection.findUnique({
      where: { id: connection.id },
    });
    if (
      current?.accessTokenCiphertext &&
      current.accessTokenIv &&
      current.tokenExpiresAt &&
      current.tokenExpiresAt.getTime() > Date.now() + 30_000
    ) {
      return decryptCredential(
        { ciphertext: current.accessTokenCiphertext, iv: current.accessTokenIv },
        config.encryptionKey,
        credentialAad({
          tenantId: current.tenantId,
          storeId: current.storeId,
          provider: 'MERCADO_PAGO',
          kind: 'access_token',
          version: current.credentialVersion,
        }),
      );
    }
    throw new ConflictError('A credencial está sendo atualizada. Tente novamente.');
  }

  try {
    const refreshToken = await decryptCredential(
      { ciphertext: connection.refreshTokenCiphertext, iv: connection.refreshTokenIv },
      config.encryptionKey,
      credentialAad({
        tenantId: connection.tenantId,
        storeId: connection.storeId,
        provider: 'MERCADO_PAGO',
        kind: 'refresh_token',
        version: connection.credentialVersion,
      }),
    );
    const token = await refreshMercadoPagoToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    assertMercadoPagoOAuthEnvironment(token.live_mode, config.oauthEnvironment);
    if (token.live_mode !== connection.liveMode) {
      throw new MercadoPagoOAuthEnvironmentMismatchError(
        connection.liveMode ? 'production' : 'sandbox',
        token.live_mode,
      );
    }
    const [access, refresh] = await Promise.all([
      encryptCredential(
        token.access_token,
        config.encryptionKey,
        credentialAad({
          tenantId: connection.tenantId,
          storeId: connection.storeId,
          provider: 'MERCADO_PAGO',
          kind: 'access_token',
        }),
      ),
      encryptCredential(
        token.refresh_token,
        config.encryptionKey,
        credentialAad({
          tenantId: connection.tenantId,
          storeId: connection.storeId,
          provider: 'MERCADO_PAGO',
          kind: 'refresh_token',
        }),
      ),
    ]);
    const updated = await getDb().storePaymentProviderConnection.updateMany({
      where: { id: connection.id, refreshLeaseId: leaseId },
      data: {
        status: connection.status === 'DISCONNECTED' ? 'DISCONNECTED' : 'ACTIVE',
        providerUserId: token.user_id,
        liveMode: token.live_mode,
        scopes: token.scope.split(/\s+/u).filter(Boolean),
        accessTokenCiphertext: access.ciphertext,
        accessTokenIv: access.iv,
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenIv: refresh.iv,
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        refreshedAt: new Date(),
        reauthRequiredAt: null,
        lastErrorCode: null,
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictError('A credencial foi atualizada por outro processo.');
    return token.access_token;
  } catch (error) {
    const code =
      error instanceof MercadoPagoApiError ||
      error instanceof MercadoPagoOAuthEnvironmentMismatchError
        ? error.code
        : 'REFRESH_FAILED';
    if (error instanceof MercadoPagoOAuthEnvironmentMismatchError) {
      logEnvironmentMismatch({
        expectedEnvironment: error.expectedEnvironment,
        receivedLiveMode: error.receivedLiveMode,
        storeId: connection.storeId,
        tenantId: connection.tenantId,
      });
    }
    if (
      error instanceof MercadoPagoApiError &&
      (error.status === 401 || error.code.toLowerCase() === 'invalid_grant')
    ) {
      await markMercadoPagoReauthRequired(connection.id, code);
      console.warn('[MP_REAUTH_REQUIRED]', { connectionId: connection.id, code });
    } else {
      await getDb().storePaymentProviderConnection.updateMany({
        where: { id: connection.id, refreshLeaseId: leaseId },
        data: {
          status: 'ERROR',
          lastErrorCode: code.slice(0, 64),
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        },
      });
    }
    throw error;
  }
}

export async function revokeMercadoPagoConnections(providerUserId: string) {
  return getDb().storePaymentProviderConnection.updateMany({
    where: { provider: 'MERCADO_PAGO', providerUserId },
    data: {
      status: 'REVOKED',
      accessTokenCiphertext: null,
      accessTokenIv: null,
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      tokenExpiresAt: null,
      reauthRequiredAt: new Date(),
      lastErrorCode: 'APPLICATION_DEAUTHORIZED',
    },
  });
}
