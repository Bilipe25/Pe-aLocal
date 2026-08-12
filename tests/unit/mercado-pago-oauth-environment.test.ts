import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  exchangeMercadoPagoAuthorizationCode,
  refreshMercadoPagoToken,
} from '@/lib/mercado-pago/client';
import {
  assertMercadoPagoOAuthEnvironment,
  getMercadoPagoConfig,
  getMercadoPagoOAuthEnvironment,
  MercadoPagoOAuthEnvironmentMismatchError,
} from '@/lib/mercado-pago/config';

const tokenResponse = {
  access_token: 'TOKEN-QUE-NAO-DEVE-APARECER-EM-ERROS',
  token_type: 'bearer',
  expires_in: 15_552_000,
  scope: 'read write offline_access',
  user_id: 123,
  refresh_token: 'REFRESH-QUE-NAO-DEVE-APARECER-EM-ERROS',
  live_mode: false,
};

function configEnv(
  appEnv: 'development' | 'staging' | 'production',
): Record<string, string | undefined> {
  return {
    APP_ENV: appEnv,
    MERCADO_PAGO_CLIENT_ID: 'client-id',
    MERCADO_PAGO_CLIENT_SECRET: 'client-secret-super-sensivel',
    MERCADO_PAGO_REDIRECT_URI: 'https://example.test/oauth/callback',
    MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
    MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY: 'encryption-key',
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ambiente do OAuth Mercado Pago', () => {
  it.each([
    ['development', 'sandbox', true],
    ['staging', 'sandbox', true],
    ['production', 'production', false],
  ] as const)(
    'define %s explicitamente como %s',
    (appEnv, expectedEnvironment, expectedTestMode) => {
      expect(getMercadoPagoOAuthEnvironment({ APP_ENV: appEnv })).toBe(expectedEnvironment);
      expect(getMercadoPagoConfig(configEnv(appEnv)).oauthTestMode).toBe(expectedTestMode);
    },
  );

  it('falha fechado quando APP_ENV está ausente', () => {
    expect(() => getMercadoPagoOAuthEnvironment({})).toThrow(
      'O ambiente OAuth do Mercado Pago não está configurado.',
    );
  });

  it.each(['development', 'staging'] as const)(
    '%s envia test_token=true na troca do authorization code',
    async (appEnv) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));
      vi.stubGlobal('fetch', fetchMock);
      const config = getMercadoPagoConfig(configEnv(appEnv));

      await exchangeMercadoPagoAuthorizationCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
        testToken: config.oauthTestMode,
      });

      expect(requestBody(fetchMock)).toMatchObject({
        grant_type: 'authorization_code',
        code_verifier: 'pkce-verifier',
        test_token: 'true',
      });
    },
  );

  it('production nunca envia test_token=true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...tokenResponse, live_mode: true }));
    vi.stubGlobal('fetch', fetchMock);
    const config = getMercadoPagoConfig(configEnv('production'));

    await exchangeMercadoPagoAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      code: 'authorization-code',
      codeVerifier: 'pkce-verifier',
      testToken: config.oauthTestMode,
    });

    expect(requestBody(fetchMock)).not.toHaveProperty('test_token');
  });

  it.each([
    ['sandbox', false],
    ['production', true],
  ] as const)('aceita live_mode compatível com %s', (environment, liveMode) => {
    expect(() => assertMercadoPagoOAuthEnvironment(liveMode, environment)).not.toThrow();
  });

  it.each([
    ['sandbox', true],
    ['production', false],
  ] as const)('rejeita live_mode incompatível com %s', (environment, liveMode) => {
    expect(() => assertMercadoPagoOAuthEnvironment(liveMode, environment)).toThrow(
      MercadoPagoOAuthEnvironmentMismatchError,
    );
  });

  it('não inclui token, client secret, authorization code ou PKCE no erro', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          code: 'invalid_grant',
          message: [
            tokenResponse.access_token,
            'client-secret-super-sensivel',
            'authorization-code-super-sensivel',
            'pkce-verifier-super-sensivel',
          ].join(' '),
        },
        400,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const error = await exchangeMercadoPagoAuthorizationCode({
      clientId: 'client-id',
      clientSecret: 'client-secret-super-sensivel',
      redirectUri: 'https://example.test/oauth/callback',
      code: 'authorization-code-super-sensivel',
      codeVerifier: 'pkce-verifier-super-sensivel',
      testToken: true,
    }).catch((caught: unknown) => caught);
    const serialized = String(error);

    expect(serialized).toContain('O Mercado Pago recusou a operação.');
    expect(serialized).not.toContain(tokenResponse.access_token);
    expect(serialized).not.toContain('client-secret-super-sensivel');
    expect(serialized).not.toContain('authorization-code-super-sensivel');
    expect(serialized).not.toContain('pkce-verifier-super-sensivel');
  });
});

describe('refresh do OAuth Mercado Pago', () => {
  it.each([
    ['sandbox', false],
    ['production', true],
  ] as const)('preserva uma conexão %s e não envia test_token', async (environment, liveMode) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...tokenResponse, live_mode: liveMode }));
    vi.stubGlobal('fetch', fetchMock);

    const token = await refreshMercadoPagoToken({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
    });

    expect(requestBody(fetchMock)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token',
    });
    expect(requestBody(fetchMock)).not.toHaveProperty('test_token');
    expect(() => assertMercadoPagoOAuthEnvironment(token.live_mode, environment)).not.toThrow();
  });

  it('mantém no serviço as guardas de state one-time, scopes e ambiente original', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/server/services/mercado-pago-connection.service.ts'),
      'utf8',
    );

    expect(source).toContain('where: { id: attempt.id, consumedAt: null');
    expect(source).toContain('codeVerifierCiphertext: null, codeVerifierIv: null');
    expect(source).toContain("scopes.includes('read')");
    expect(source).toContain("scopes.includes('write')");
    expect(source).toContain(
      'assertMercadoPagoOAuthEnvironment(token.live_mode, config.oauthEnvironment)',
    );
    expect(source).toContain('token.live_mode !== connection.liveMode');
  });
});
