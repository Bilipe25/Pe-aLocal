import { describe, expect, it } from 'vitest';

import { getMercadoPagoOperationalReadiness } from '@/lib/mercado-pago/config';
import { parseMercadoPagoConnectionFeedback } from '@/lib/mercado-pago/oauth-feedback';
import { resolveMercadoPagoCapability } from '@/server/services/mercado-pago-connection.service';

const activeConnection = {
  status: 'ACTIVE' as const,
  liveMode: false,
  connectedAt: new Date('2026-08-12T12:00:00.000Z'),
  refreshedAt: null,
  reauthRequiredAt: null,
};

function capabilitySource({
  entitled = true,
  mode = 'MANUAL' as 'MANUAL' | 'ONLINE',
  connection = activeConnection as
    | typeof activeConnection
    | (Omit<typeof activeConnection, 'status'> & { status: 'REAUTH_REQUIRED' })
    | null,
} = {}) {
  return {
    entitlement: { onlinePaymentsEnabled: entitled },
    settings: { paymentMode: mode },
    paymentProviderConnections: connection ? [connection] : [],
  };
}

describe('capacidade Mercado Pago da tela da loja', () => {
  it('permanece oculta quando o rollout global está desligado', () => {
    expect(resolveMercadoPagoCapability(capabilitySource(), false, 'sandbox')).toBeNull();
  });

  it('permanece oculta quando a loja não possui entitlement', () => {
    expect(
      resolveMercadoPagoCapability(capabilitySource({ entitled: false }), true, 'sandbox'),
    ).toBeNull();
  });

  it('fica visível, mas não permite Online antes da conexão', () => {
    expect(
      resolveMercadoPagoCapability(capabilitySource({ connection: null }), true, 'sandbox'),
    ).toMatchObject({
      mode: 'MANUAL',
      effectiveMode: 'MANUAL',
      connection: null,
      canSelectOnline: false,
      environment: 'sandbox',
    });
  });

  it('permite Online somente com conexão ativa', () => {
    expect(
      resolveMercadoPagoCapability(capabilitySource({ mode: 'ONLINE' }), true, 'production'),
    ).toMatchObject({
      mode: 'ONLINE',
      effectiveMode: 'ONLINE',
      canSelectOnline: true,
      environment: 'production',
    });
  });

  it('preserva a preferência Online e informa fallback efetivo quando exige reconexão', () => {
    const connection = { ...activeConnection, status: 'REAUTH_REQUIRED' as const };
    expect(
      resolveMercadoPagoCapability(
        capabilitySource({ mode: 'ONLINE', connection }),
        true,
        'sandbox',
      ),
    ).toMatchObject({ mode: 'ONLINE', effectiveMode: 'MANUAL', canSelectOnline: false });
  });
});

describe('diagnóstico operacional Mercado Pago', () => {
  const completeEnv = {
    APP_ENV: 'staging',
    MERCADO_PAGO_ENABLED: 'true',
    MERCADO_PAGO_CLIENT_ID: 'client-id',
    MERCADO_PAGO_CLIENT_SECRET: 'client-secret',
    MERCADO_PAGO_REDIRECT_URI: 'https://example.test/oauth/callback',
    MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
    MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY: 'encryption-key',
    MERCADO_PAGO_TEST_APPLICATION_ID: 'test-application-id',
    MERCADO_PAGO_TEST_ACCESS_TOKEN: 'APP_USR-test-access-token',
  };

  it('expõe somente prontidão, contagem e ambiente seguros', () => {
    expect(getMercadoPagoOperationalReadiness(completeEnv)).toEqual({
      rolloutEnabled: true,
      configurationReady: true,
      configuredBindings: 7,
      requiredBindings: 7,
      environment: 'sandbox',
    });
  });

  it('sinaliza configuração incompleta sem expor valores', () => {
    const readiness = getMercadoPagoOperationalReadiness({
      ...completeEnv,
      MERCADO_PAGO_CLIENT_SECRET: undefined,
    });

    expect(readiness).toMatchObject({ configurationReady: false, configuredBindings: 6 });
    expect(JSON.stringify(readiness)).not.toContain('client-secret');
  });

  it('considera o staging indisponível sem o Access Token de teste da aplicação', () => {
    const readiness = getMercadoPagoOperationalReadiness({
      ...completeEnv,
      MERCADO_PAGO_TEST_ACCESS_TOKEN: undefined,
    });

    expect(readiness).toMatchObject({
      configurationReady: false,
      configuredBindings: 6,
      requiredBindings: 7,
      environment: 'sandbox',
    });
  });

  it('considera o staging indisponível sem o N.º da aplicação de teste', () => {
    const readiness = getMercadoPagoOperationalReadiness({
      ...completeEnv,
      MERCADO_PAGO_TEST_APPLICATION_ID: undefined,
    });

    expect(readiness).toMatchObject({
      configurationReady: false,
      configuredBindings: 6,
      requiredBindings: 7,
      environment: 'sandbox',
    });
  });
});

describe('feedback seguro do callback OAuth', () => {
  it.each(['connected', 'invalid_grant', 'environment_mismatch', 'internal_error'] as const)(
    'aceita o motivo conhecido %s',
    (reason) => {
      expect(parseMercadoPagoConnectionFeedback(reason)).toBe(reason);
    },
  );

  it('descarta motivos forjados ou dados brutos do provedor', () => {
    expect(parseMercadoPagoConnectionFeedback('access-token-sensível')).toBeNull();
    expect(parseMercadoPagoConnectionFeedback(undefined)).toBeNull();
  });
});
