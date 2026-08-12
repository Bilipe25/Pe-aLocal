import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/integrations/mercado-pago/oauth/callback/route';
import { MercadoPagoOAuthCompletionError } from '@/server/services/mercado-pago-connection.service';

const mocks = vi.hoisted(() => ({ completeMercadoPagoOAuth: vi.fn() }));

vi.mock('@/server/services/mercado-pago-connection.service', () => {
  class OAuthCompletionError extends Error {
    constructor(
      readonly reason: string,
      readonly returnPath: string,
    ) {
      super('OAuth failed');
      this.name = 'MercadoPagoOAuthCompletionError';
    }
  }

  return {
    completeMercadoPagoOAuth: mocks.completeMercadoPagoOAuth,
    MercadoPagoOAuthCompletionError: OAuthCompletionError,
  };
});

function callbackRequest() {
  return new Request(
    'https://app.test/api/integrations/mercado-pago/oauth/callback?state=state-seguro&code=code-seguro',
  );
}

describe('callback OAuth Mercado Pago', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna para a configuração da loja depois da conexão', async () => {
    mocks.completeMercadoPagoOAuth.mockResolvedValue({
      returnPath: '/dashboard/stores/store-1/payments',
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://app.test/dashboard/stores/store-1/payments?connection=connected',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('preserva a loja e expõe somente o motivo sanitizado da falha', async () => {
    mocks.completeMercadoPagoOAuth.mockRejectedValue(
      new MercadoPagoOAuthCompletionError('invalid_grant', '/dashboard/stores/store-1/payments'),
    );

    const response = await GET(callbackRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      'https://app.test/dashboard/stores/store-1/payments?connection=invalid_grant',
    );
    expect(response.headers.get('location')).not.toContain('code-seguro');
    expect(response.headers.get('location')).not.toContain('state-seguro');
  });
});
