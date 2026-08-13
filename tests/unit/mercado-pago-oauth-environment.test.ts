import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  exchangeMercadoPagoAuthorizationCode,
  getMercadoPagoSellerProfile,
  MercadoPagoApiError,
  refreshMercadoPagoToken,
} from '@/lib/mercado-pago/client';
import {
  assertMercadoPagoOrdersCompatibleAccessToken,
  assertMercadoPagoSellerEnvironment,
  getMercadoPagoConfig,
  getMercadoPagoOAuthEnvironment,
  MercadoPagoOAuthEnvironmentMismatchError,
  MercadoPagoOrdersCredentialError,
} from '@/lib/mercado-pago/config';

const tokenResponse = {
  access_token: 'APP_USR-TOKEN-QUE-NAO-DEVE-APARECER-EM-ERROS',
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

describe('ambiente e credencial do OAuth Mercado Pago', () => {
  it.each([
    ['development', 'sandbox'],
    ['staging', 'sandbox'],
    ['production', 'production'],
  ] as const)('define %s explicitamente como %s', (appEnv, expectedEnvironment) => {
    expect(getMercadoPagoOAuthEnvironment({ APP_ENV: appEnv })).toBe(expectedEnvironment);
    expect(getMercadoPagoConfig(configEnv(appEnv)).oauthEnvironment).toBe(expectedEnvironment);
  });

  it('falha fechado quando APP_ENV está ausente', () => {
    expect(() => getMercadoPagoOAuthEnvironment({})).toThrow(
      'O ambiente OAuth do Mercado Pago não está configurado.',
    );
  });

  it.each(['development', 'staging', 'production'] as const)(
    '%s nunca envia test_token na troca do authorization code',
    async (appEnv) => {
      const response =
        appEnv === 'production' ? { ...tokenResponse, live_mode: true } : tokenResponse;
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
      vi.stubGlobal('fetch', fetchMock);
      const config = getMercadoPagoConfig(configEnv(appEnv));

      await exchangeMercadoPagoAuthorizationCode({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
      });

      expect(requestBody(fetchMock)).toMatchObject({
        grant_type: 'authorization_code',
        code_verifier: 'pkce-verifier',
      });
      expect(requestBody(fetchMock)).not.toHaveProperty('test_token');
    },
  );

  it('aceita APP_USR com live_mode=false no sandbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenResponse));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      exchangeMercadoPagoAuthorizationCode({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.test/oauth/callback',
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
      }),
    ).resolves.toMatchObject({ live_mode: false, access_token: tokenResponse.access_token });
  });

  it('normaliza live_mode textual sem inferir o ambiente pelo prefixo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...tokenResponse, live_mode: 'false' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      exchangeMercadoPagoAuthorizationCode({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.test/oauth/callback',
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
      }),
    ).resolves.toMatchObject({ live_mode: false });
  });

  it.each([
    ['TEST-token-de-sandbox', false, 'access_token', 'custom'],
    ['APP_USR-token-sem-live-mode', undefined, 'live_mode', 'invalid_type'],
  ] as const)(
    'rejeita resposta incompatível (%s)',
    async (accessToken, liveMode, issuePath, issueCode) => {
      const response = { ...tokenResponse, access_token: accessToken, live_mode: liveMode };
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(response));
      vi.stubGlobal('fetch', fetchMock);

      const error = await exchangeMercadoPagoAuthorizationCode({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        redirectUri: 'https://example.test/oauth/callback',
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(MercadoPagoApiError);
      expect((error as MercadoPagoApiError).validationIssues).toContainEqual({
        path: issuePath,
        code: issueCode,
      });
    },
  );

  it('valida diretamente a compatibilidade da credencial com Orders', () => {
    expect(() => assertMercadoPagoOrdersCompatibleAccessToken('APP_USR-valid')).not.toThrow();
    expect(() => assertMercadoPagoOrdersCompatibleAccessToken('TEST-invalid')).toThrow(
      MercadoPagoOrdersCredentialError,
    );
  });

  it.each([
    ['sandbox', true],
    ['production', false],
  ] as const)('aceita o tipo de vendedor compatível com %s', (environment, isTestUser) => {
    expect(() => assertMercadoPagoSellerEnvironment(isTestUser, environment)).not.toThrow();
  });

  it.each([
    ['sandbox', false],
    ['production', true],
  ] as const)('rejeita o tipo de vendedor incompatível com %s', (environment, isTestUser) => {
    expect(() => assertMercadoPagoSellerEnvironment(isTestUser, environment)).toThrow(
      MercadoPagoOAuthEnvironmentMismatchError,
    );
  });

  it('identifica vendedor de teste pela tag oficial sem depender de live_mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 123,
        nickname: 'TESTSELLER',
        email: 'dado-que-nao-deve-ser-retornado@example.test',
        tags: ['normal', 'test_user'],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const seller = await getMercadoPagoSellerProfile({
      accessToken: tokenResponse.access_token,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.mercadolibre.com/users/me');
    expect(seller).toEqual({ id: '123', tags: ['normal', 'test_user'] });
    expect(seller).not.toHaveProperty('email');
    expect(seller).not.toHaveProperty('nickname');
  });

  it('não inclui secrets do request no erro do provedor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ code: 'invalid_grant', message: 'conteúdo sensível do provedor' }, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    const error = await exchangeMercadoPagoAuthorizationCode({
      clientId: 'client-id',
      clientSecret: 'client-secret-super-sensivel',
      redirectUri: 'https://example.test/oauth/callback',
      code: 'authorization-code-super-sensivel',
      codeVerifier: 'pkce-verifier-super-sensivel',
    }).catch((caught: unknown) => caught);
    const serialized = String(error);

    expect(serialized).toContain('O Mercado Pago recusou a operação.');
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

    expect(requestBody(fetchMock)).not.toHaveProperty('test_token');
    expect(token.live_mode).toBe(liveMode);
  });

  it('mantém no serviço as guardas de state, scopes, ambiente e credencial Orders', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/server/services/mercado-pago-connection.service.ts'),
      'utf8',
    );

    expect(source).toContain('where: { id: attempt.id, consumedAt: null');
    expect(source).toContain('codeVerifierCiphertext: null, codeVerifierIv: null');
    expect(source).toContain("scopes.includes('read')");
    expect(source).toContain("scopes.includes('write')");
    expect(source).toContain("seller.tags.includes('test_user')");
    expect(source).toContain('assertMercadoPagoSellerEnvironment(');
    expect(source).toContain('assertMercadoPagoOrdersCompatibleAccessToken(token.access_token)');
    expect(source).toContain('token.user_id !== connection.providerUserId');
  });
});
