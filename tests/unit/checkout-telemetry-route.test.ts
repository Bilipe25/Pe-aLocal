import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicStoreScopeBySlug: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock('@/server/queries/public-store', () => ({
  getPublicStoreScopeBySlug: mocks.getPublicStoreScopeBySlug,
}));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { checkoutQuote: { maxAttempts: 60, windowInSeconds: 60 } },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));

import { POST } from '@/app/api/storefront/[storeSlug]/checkout/events/route';

const originalAppEnv = process.env.APP_ENV;

function restoreAppEnv() {
  if (originalAppEnv) {
    process.env.APP_ENV = originalAppEnv;
  } else {
    Reflect.deleteProperty(process.env, 'APP_ENV');
  }
}

function request(payload: unknown, headers: Record<string, string> = {}) {
  return new Request('https://pedidolocal.test/api/storefront/loja-a/checkout/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.10',
      'cf-ray': 'ray-test-a',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function oversizedStreamingRequest(declaredLength?: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_500).fill(0x20));
      controller.enqueue(new Uint8Array(549).fill(0x20));
      controller.close();
    },
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.10',
    'cf-ray': 'ray-test-stream',
  };
  if (declaredLength) headers['content-length'] = declaredLength;

  return new Request('https://pedidolocal.test/api/storefront/loja-a/checkout/events', {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

const context = { params: Promise.resolve({ storeSlug: 'loja-a' }) };

describe('POST checkout/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreAppEnv();
    mocks.getPublicStoreScopeBySlug.mockResolvedValue({ id: 'store-a' });
    mocks.rateLimitCheck.mockResolvedValue({
      allowed: true,
      unavailable: false,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreAppEnv();
    vi.restoreAllMocks();
  });

  it('aceita somente métricas do funil sem PII e responde 204 sem cache', async () => {
    const info = vi.mocked(console.info);

    const response = await POST(
      request({
        event: 'checkout_step_viewed',
        step: 'payment',
      }),
      context,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(response.headers.get('x-correlation-id')).toBe('ray-test-a');
    expect(mocks.getPublicStoreScopeBySlug).toHaveBeenCalledWith('loja-a');
    expect(mocks.rateLimitCheck).toHaveBeenCalledWith({
      identifier: 'checkout-event:store-a:203.0.113.10',
      maxAttempts: 60,
      windowInSeconds: 60,
      strict: false,
    });

    const logged = JSON.parse(info.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged).toEqual({
      event: 'checkout_funnel_event',
      correlationId: 'ray-test-a',
      storeId: 'store-a',
      funnelEvent: 'checkout_step_viewed',
      step: 'payment',
      reason: null,
    });
    expect(JSON.stringify(logged)).not.toMatch(/phone|address|postal|token|customer/i);
  });

  it.each([
    ['evento desconhecido', { event: 'customer_identified' }],
    [
      'campo com PII',
      {
        event: 'checkout_started',
        customerPhone: '(85) 99999-9999',
      },
    ],
    [
      'etapa inválida',
      {
        event: 'checkout_step_viewed',
        step: 'confirmation',
      },
    ],
  ])('rejeita %s pelo schema estrito', async (_label, payload) => {
    const response = await POST(request(payload), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'O evento informado é inválido.',
    });
    expect(console.info).not.toHaveBeenCalled();
  });

  it('rejeita corpo acima de 2 KiB antes de consultar loja ou limiter', async () => {
    const response = await POST(
      request(
        { event: 'checkout_started' },
        {
          'content-length': '2049',
        },
      ),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.getPublicStoreScopeBySlug).not.toHaveBeenCalled();
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
  });

  it.each([
    ['ausente', undefined],
    ['enganoso', '16'],
  ])(
    'interrompe corpo streaming acima de 2 KiB com Content-Length %s',
    async (_label, declaredLength) => {
      const response = await POST(oversizedStreamingRequest(declaredLength), context);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'O evento informado é inválido.',
      });
      expect(mocks.getPublicStoreScopeBySlug).toHaveBeenCalledOnce();
      expect(mocks.rateLimitCheck).toHaveBeenCalledOnce();
      expect(console.info).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['limite excedido', { allowed: false, unavailable: false }],
    ['binding indisponível', { allowed: false, unavailable: true }],
  ])('retorna RATE_LIMITED para %s sem registrar o evento', async (_label, state) => {
    process.env.APP_ENV = 'staging';
    mocks.rateLimitCheck.mockResolvedValue({
      ...state,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const info = vi.mocked(console.info);

    const response = await POST(request({ event: 'checkout_started' }), context);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(mocks.rateLimitCheck).toHaveBeenCalledWith(expect.objectContaining({ strict: true }));
    expect(info).not.toHaveBeenCalled();
  });
});
