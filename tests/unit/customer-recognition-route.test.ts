import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirmAddress: vi.fn(),
  continueWithNewAddress: vi.fn(),
  getStoreScope: vi.fn(),
  hashSecret: vi.fn(),
  invalidateSession: vi.fn(),
  rateLimitCheck: vi.fn(),
  startRecognition: vi.fn(),
}));

vi.mock('@/server/queries/public-store', () => ({
  getPublicStoreScopeBySlug: mocks.getStoreScope,
}));

vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: {
    customerRecognitionByStore: { maxAttempts: 60, windowInSeconds: 60 },
    customerRecognitionByIp: { maxAttempts: 30, windowInSeconds: 60 },
    customerRecognitionByPhone: { maxAttempts: 5, windowInSeconds: 60 },
  },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));

vi.mock('@/server/services/customer-recognition.service', () => {
  class RecognitionRateLimitError extends Error {
    retryAfterSeconds = 15;
  }
  return {
    confirmRecognitionAddress: mocks.confirmAddress,
    continueRecognitionWithNewAddress: mocks.continueWithNewAddress,
    getRecognitionCookieName: () =>
      process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production'
        ? '__Host-pedidolocal_recognition'
        : 'pedidolocal_recognition',
    hashRecognitionSecret: mocks.hashSecret,
    invalidateRecognitionSession: mocks.invalidateSession,
    RecognitionRateLimitError,
    startCustomerRecognition: mocks.startRecognition,
  };
});

import { DELETE, PATCH, POST } from '@/app/api/storefront/[storeSlug]/checkout/recognition/route';

const context = { params: Promise.resolve({ storeSlug: 'burger-do-ze' }) };
const validInput = { customerPhone: '(11) 99999-1234', customerName: 'João Martins' };

function request(
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request('https://loja.test/api/storefront/burger-do-ze/checkout/recognition', {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: 'https://loja.test',
      'cf-connecting-ip': '203.0.113.20',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/storefront/:storeSlug/checkout/recognition', () => {
  const originalAppEnv = process.env.APP_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, 'APP_ENV');
    mocks.getStoreScope.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      slug: 'burger-do-ze',
    });
    mocks.hashSecret.mockResolvedValue('f'.repeat(64));
    mocks.rateLimitCheck.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });
    mocks.startRecognition.mockResolvedValue({
      result: {
        recognized: true,
        maskedName: 'João M***',
        maskedPhone: '(11) *****-**34',
        maskedAddresses: [
          {
            opaqueReference: 'r'.repeat(43),
            label: 'Casa',
            maskedAddress: 'Rua das F***, nº *** — Centro',
            isDefault: true,
            requiresDeliveryZoneSelection: false,
          },
        ],
      },
      browserToken: 't'.repeat(43),
      expiresAt: new Date('2026-07-29T15:15:00.000Z'),
    });
    mocks.confirmAddress.mockResolvedValue({
      confirmed: true,
      mode: 'SAVED_ADDRESS',
      opaqueReference: 'r'.repeat(43),
    });
    mocks.continueWithNewAddress.mockResolvedValue({ confirmed: true, mode: 'NEW_ADDRESS' });
    mocks.invalidateSession.mockResolvedValue({ invalidated: true });
  });

  afterEach(() => {
    if (originalAppEnv) process.env.APP_ENV = originalAppEnv;
    else Reflect.deleteProperty(process.env, 'APP_ENV');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reconhece somente ao POST e retorna exclusivamente dados mascarados', async () => {
    const response = await POST(request('POST', validInput), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(response.headers.get('set-cookie')).toContain(
      'pedidolocal_recognition=ttttttttttttttttttttttttttttttttttttttttttt',
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).not.toContain('Secure');
    expect(body).toMatchObject({
      recognized: true,
      maskedName: 'João M***',
      maskedPhone: '(11) *****-**34',
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/customerId|addressId|tenantId|phoneNormalized|182|01234/);
    expect(mocks.startRecognition).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      input: { customerPhone: '5511999991234', customerName: 'João Martins' },
      browserToken: null,
      clientIp: '203.0.113.20',
    });
  });

  it('acumula IP e telefone no tenant e mantém o limite de loja independente', async () => {
    await POST(request('POST', validInput), context);
    const firstIdentifiers = mocks.rateLimitCheck.mock.calls.map(([input]) => input.identifier);

    mocks.rateLimitCheck.mockClear();
    mocks.getStoreScope.mockResolvedValueOnce({
      id: 'store-b',
      tenantId: 'tenant-a',
      slug: 'segunda-loja',
    });
    await POST(
      new Request('https://loja.test/api/storefront/segunda-loja/checkout/recognition', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://loja.test',
          'cf-connecting-ip': '203.0.113.20',
        },
        body: JSON.stringify(validInput),
      }),
      { params: Promise.resolve({ storeSlug: 'segunda-loja' }) },
    );
    const secondIdentifiers = mocks.rateLimitCheck.mock.calls.map(([input]) => input.identifier);
    const identifiers = [...firstIdentifiers, ...secondIdentifiers].join(' ');

    expect(identifiers).not.toContain('203.0.113.20');
    expect(identifiers).not.toContain('5511999991234');
    expect(firstIdentifiers).toContain('recognition-store:store-a');
    expect(secondIdentifiers).toContain('recognition-store:store-b');
    expect(firstIdentifiers).toContain(`recognition-ip:tenant-a:${'f'.repeat(64)}`);
    expect(secondIdentifiers).toContain(`recognition-ip:tenant-a:${'f'.repeat(64)}`);
    expect(firstIdentifiers).toContain(`recognition-phone:tenant-a:${'f'.repeat(64)}`);
    expect(secondIdentifiers).toContain(`recognition-phone:tenant-a:${'f'.repeat(64)}`);
  });

  it('usa cookie __Host, Secure e exige Origin em staging', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_ENV = 'staging';

    const response = await POST(request('POST', validInput), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('__Host-pedidolocal_recognition=');
    expect(response.headers.get('set-cookie')).toContain('Secure');

    const missingOrigin = await POST(request('POST', validInput, { origin: '' }), context);
    expect(missingOrigin.status).toBe(400);
  });

  it('falha de forma segura quando um binding obrigatório está indisponível', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_ENV = 'staging';
    mocks.rateLimitCheck.mockResolvedValueOnce({
      allowed: false,
      unavailable: true,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    const response = await POST(request('POST', validInput), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      recognized: false,
      recognitionUnavailable: true,
    });
    expect(mocks.startRecognition).not.toHaveBeenCalled();
  });

  it('rejeita origem cruzada e corpo maior que 4 KiB antes de consultar o banco', async () => {
    const crossOrigin = await POST(
      request('POST', validInput, { origin: 'https://atacante.test' }),
      context,
    );
    expect(crossOrigin.status).toBe(400);

    const oversized = await POST(
      request('POST', { ...validInput, padding: 'x'.repeat(5_000) }),
      context,
    );
    expect(oversized.status).toBe(400);
    expect(mocks.getStoreScope).not.toHaveBeenCalled();
    expect(mocks.startRecognition).not.toHaveBeenCalled();
  });

  it('confirma uma referência usando exclusivamente o cookie HttpOnly', async () => {
    const response = await PATCH(
      request(
        'PATCH',
        { action: 'CONFIRM_ADDRESS', opaqueReference: 'r'.repeat(43) },
        { cookie: `pedidolocal_recognition=${'t'.repeat(43)}` },
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.confirmAddress).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      browserToken: 't'.repeat(43),
      opaqueReference: 'r'.repeat(43),
    });
  });

  it('não confirma nada sem uma sessão válida', async () => {
    const response = await PATCH(request('PATCH', { action: 'USE_NEW_ADDRESS' }), context);

    expect(response.status).toBe(410);
    expect(mocks.continueWithNewAddress).not.toHaveBeenCalled();
  });

  it('invalida de modo idempotente e remove o cookie ao escolher Não sou eu', async () => {
    const response = await DELETE(
      request('DELETE', undefined, {
        cookie: `pedidolocal_recognition=${'t'.repeat(43)}`,
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ invalidated: true });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(mocks.invalidateSession).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      browserToken: 't'.repeat(43),
    });
  });
});
