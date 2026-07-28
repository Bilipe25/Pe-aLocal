import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateCheckoutQuote: vi.fn(),
  rateLimitCheck: vi.fn(),
  toPublicCheckoutQuote: vi.fn(),
}));

vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { checkoutQuote: { maxAttempts: 60, windowInSeconds: 60 } },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));
vi.mock('@/server/services/checkout-quote.service', () => ({
  calculateCheckoutQuote: mocks.calculateCheckoutQuote,
  toPublicCheckoutQuote: mocks.toPublicCheckoutQuote,
}));

import { POST } from '@/app/api/storefront/[storeSlug]/checkout/quote/route';

const context = { params: Promise.resolve({ storeSlug: 'loja-a' }) };
const validPayload = {
  modality: 'PICKUP',
  items: [
    {
      lineId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      quantity: 1,
      notes: '',
      optionIds: [],
    },
  ],
};

function request(body: BodyInit, headers: Record<string, string> = {}, query = '') {
  return new Request(`https://pedidolocal.test/api/storefront/loja-a/checkout/quote${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.10',
      'cf-ray': 'ray-quote-a',
      ...headers,
    },
    body,
  });
}

function oversizedStreamingRequest(declaredLength?: string) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(200 * 1_024).fill(0x20));
      controller.enqueue(new Uint8Array(60 * 1_024).fill(0x20));
      controller.close();
    },
  });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.10',
    'cf-ray': 'ray-quote-stream',
  };
  if (declaredLength) headers['content-length'] = declaredLength;
  const init = {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' };
  return new Request('https://pedidolocal.test/api/storefront/loja-a/checkout/quote', init);
}

describe('POST checkout/quote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({
      allowed: true,
      unavailable: false,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    mocks.calculateCheckoutQuote.mockResolvedValue({
      storeId: 'store-a',
      issues: [],
    });
    mocks.toPublicCheckoutQuote.mockReturnValue({
      quoteFingerprint: 'a'.repeat(64),
      canCheckout: true,
      issues: [],
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejeita Content-Length acima de 256 KiB antes do limiter e do JSON', async () => {
    const response = await POST(
      request(JSON.stringify(validPayload), {
        'content-length': String(256 * 1_024 + 1),
      }),
      context,
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 413,
      code: 'CART_INVALID',
      message: 'O carrinho enviado excede o limite permitido.',
    });
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
  });

  it.each([
    ['ausente', undefined],
    ['enganoso', '16'],
  ])(
    'interrompe corpo streaming acima do limite com Content-Length %s',
    async (_case, declaredLength) => {
      const response = await POST(oversizedStreamingRequest(declaredLength), context);

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({
        statusCode: 413,
        code: 'CART_INVALID',
      });
      expect(mocks.rateLimitCheck).toHaveBeenCalledOnce();
      expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
    },
  );

  it('rejeita JSON inválido sem chamar o serviço de cotação', async () => {
    const response = await POST(request('{"items":'), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 400,
      code: 'CART_INVALID',
      message: 'O corpo da cotação deve ser um JSON válido.',
    });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
  });

  it('rejeita payload fora do schema como CART_INVALID com detalhes seguros', async () => {
    const response = await POST(request(JSON.stringify({ ...validPayload, items: [] })), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 400,
      code: 'CART_INVALID',
      message: 'Revise os itens antes de calcular o pedido.',
      details: [expect.objectContaining({ path: 'items' })],
    });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
  });

  it('aceita JSON válido, valida o schema e lê o corpo uma única vez', async () => {
    const response = await POST(request(JSON.stringify(validPayload)), context);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(response.headers.get('x-correlation-id')).toBe('ray-quote-a');
    await expect(response.json()).resolves.toMatchObject({
      quoteFingerprint: 'a'.repeat(64),
      canCheckout: true,
    });
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledWith('loja-a', validPayload);
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledOnce();
  });

  it('aceita a prévia do carrinho de uma loja somente entrega sem exigir CEP antecipado', async () => {
    const payload = { ...validPayload, modality: 'DELIVERY' };
    const response = await POST(request(JSON.stringify(payload), {}, '?context=cart'), context);

    expect(response.status).toBe(200);
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledWith('loja-a', payload);
  });
});
