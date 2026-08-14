import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSellerProfile: vi.fn(),
  getAccessToken: vi.fn(),
  findConnection: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mercado-pago/client', () => ({
  getMercadoPagoSellerProfile: mocks.getSellerProfile,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    storePaymentProviderConnection: { findUnique: mocks.findConnection },
  }),
}));
vi.mock('@/server/services/mercado-pago-connection.service', () => ({
  getMercadoPagoAccessToken: mocks.getAccessToken,
}));

import { getMercadoPagoOrdersCredential } from '@/server/services/mercado-pago-orders-credential.service';

describe('credencial da Orders API Mercado Pago', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('MERCADO_PAGO_CLIENT_ID', 'client-id');
    vi.stubEnv('MERCADO_PAGO_CLIENT_SECRET', 'client-secret');
    vi.stubEnv('MERCADO_PAGO_REDIRECT_URI', 'https://example.test/oauth/callback');
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY', 'encryption-key');
  });

  it('usa o Access Token de teste da aplicação no sandbox sem ler o OAuth da loja', async () => {
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('MERCADO_PAGO_TEST_ACCESS_TOKEN', 'APP_USR-application-test');
    mocks.getSellerProfile.mockResolvedValue({ id: 'test-seller', tags: ['test_user'] });

    await expect(getMercadoPagoOrdersCredential('connection-1')).resolves.toEqual({
      accessToken: 'APP_USR-application-test',
      expectedProviderUserId: 'test-seller',
      source: 'APPLICATION_TEST',
    });
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(mocks.findConnection).not.toHaveBeenCalled();
  });

  it('rejeita o sandbox quando o Access Token de teste é incompatível', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('MERCADO_PAGO_TEST_ACCESS_TOKEN', 'TEST-invalid');

    await expect(getMercadoPagoOrdersCredential('connection-1')).rejects.toThrow(
      'Access Token de teste',
    );
    expect(mocks.getSellerProfile).not.toHaveBeenCalled();
  });

  it('mantém o token OAuth individual da loja em produção', async () => {
    vi.stubEnv('APP_ENV', 'production');
    mocks.findConnection.mockResolvedValue({ providerUserId: 'store-seller' });
    mocks.getAccessToken.mockResolvedValue('APP_USR-store-oauth');

    await expect(getMercadoPagoOrdersCredential('connection-1')).resolves.toEqual({
      accessToken: 'APP_USR-store-oauth',
      expectedProviderUserId: 'store-seller',
      source: 'OAUTH',
    });
    expect(mocks.getAccessToken).toHaveBeenCalledWith('connection-1', {});
    expect(mocks.getSellerProfile).not.toHaveBeenCalled();
  });
});
