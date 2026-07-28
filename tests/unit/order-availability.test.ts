import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrderAction, getCheckoutAvailabilityAction } from '@/features/orders/actions';
import { CheckoutError, QuoteChangedError } from '@/server/errors';

const mocks = vi.hoisted(() => ({
  storeFindUnique: vi.fn(),
  getEffectiveStoreAvailabilityForTenant: vi.fn(),
  rateLimitCheck: vi.fn(),
  createOrder: vi.fn(),
  dispatchCommittedOrderEvents: vi.fn(),
  triggerNewOrder: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    store: { findUnique: mocks.storeFindUnique },
  }),
}));
vi.mock('@/server/services/store-availability.service', () => ({
  getEffectiveStoreAvailabilityForTenant: mocks.getEffectiveStoreAvailabilityForTenant,
}));
vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: {
    createOrderByIp: { maxAttempts: 30, windowInSeconds: 60 },
    createOrder: { maxAttempts: 10, windowInSeconds: 60 },
  },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));
vi.mock('@/server/repositories/order.repository', () => ({ createOrder: mocks.createOrder }));
vi.mock('@/server/services/order-event-dispatch.service', () => ({
  dispatchCommittedOrderEvents: mocks.dispatchCommittedOrderEvents,
}));
vi.mock('@/lib/pusher/server', () => ({
  triggerNewOrder: mocks.triggerNewOrder,
  triggerPaymentUpdated: vi.fn(),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.10' }),
}));

const checkout = {
  customerName: 'Cliente Teste',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP' as const,
  paymentMethod: 'PIX' as const,
  expectedQuoteFingerprint: 'a'.repeat(64),
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      lineId: '10000000-0000-4000-8000-000000000001',
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      optionIds: [],
    },
  ],
};

const originalAppEnv = process.env.APP_ENV;

function restoreAppEnv() {
  if (originalAppEnv) {
    process.env.APP_ENV = originalAppEnv;
  } else {
    Reflect.deleteProperty(process.env, 'APP_ENV');
  }
}

describe('checkout público v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreAppEnv();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, unavailable: false });
    mocks.storeFindUnique.mockResolvedValue({ id: 'store-a', tenantId: 'tenant-a' });
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: true,
      state: 'OPEN',
      reason: 'Aberta agora.',
      nextTransitionAt: null,
    });
    mocks.createOrder.mockResolvedValue({
      id: 'order-a',
      storeId: 'store-a',
      publicToken: 'public-token',
      orderNumber: 10,
      paymentReportToken: 'payment-report-token',
      created: true,
      outboxEventIds: ['outbox-a'],
    });
    mocks.dispatchCommittedOrderEvents.mockResolvedValue({ notificationPending: false });
  });

  afterEach(() => {
    restoreAppEnv();
  });

  it('expõe preflight público sem criar ou cotar o pedido', async () => {
    mocks.getEffectiveStoreAvailabilityForTenant.mockResolvedValue({
      acceptingOrders: false,
      state: 'PAUSED',
      reason: 'A loja pausou os pedidos.',
      nextTransitionAt: new Date('2026-07-28T12:00:00.000Z'),
    });

    const result = await getCheckoutAvailabilityAction('loja-a');

    expect(result).toEqual({
      success: true,
      data: {
        acceptingOrders: false,
        state: 'PAUSED',
        reason: 'A loja pausou os pedidos.',
        nextTransitionAt: '2026-07-28T12:00:00.000Z',
      },
    });
    expect(mocks.getEffectiveStoreAvailabilityForTenant).toHaveBeenCalledWith(
      'tenant-a',
      'store-a',
    );
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('valida o contrato antes do rate limit e do repositório', async () => {
    const result = await createOrderAction('loja-a', {
      ...checkout,
      expectedQuoteFingerprint: 'inválido',
    });

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'CART_INVALID',
        details: [expect.objectContaining({ path: 'expectedQuoteFingerprint' })],
      },
    });
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('aplica limites independentes por loja/IP e loja/telefone sem expor o telefone', async () => {
    const result = await createOrderAction('loja-a', checkout);

    expect(result.success).toBe(true);
    expect(mocks.rateLimitCheck).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimitCheck).toHaveBeenCalledWith({
      identifier: 'order-ip:loja-a:203.0.113.10',
      maxAttempts: 30,
      windowInSeconds: 60,
      strict: false,
    });
    const phoneIdentifier = mocks.rateLimitCheck.mock.calls
      .map(([request]) => request.identifier as string)
      .find((identifier) => identifier.startsWith('order:loja-a:'));
    expect(phoneIdentifier).toMatch(/^order:loja-a:[a-f0-9]{64}$/);
    expect(phoneIdentifier).not.toContain('99999');
  });

  it.each([
    ['limite excedido', { allowed: false, unavailable: false }],
    ['limiter indisponível', { allowed: false, unavailable: true }],
  ])('retorna RATE_LIMITED para %s e falha antes da transação', async (_label, state) => {
    process.env.APP_ENV = 'staging';
    mocks.rateLimitCheck.mockResolvedValue(state);

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
    expect(mocks.rateLimitCheck).toHaveBeenCalledWith(expect.objectContaining({ strict: true }));
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('delega a criação autoritativa, publica somente o outbox confirmado e não vaza tokens', async () => {
    const result = await createOrderAction('loja-a', checkout);

    expect(result).toEqual({
      success: true,
      data: {
        publicToken: 'public-token',
        orderNumber: 10,
        paymentReportToken: 'payment-report-token',
      },
    });
    expect(mocks.createOrder).toHaveBeenCalledWith({
      input: expect.objectContaining({
        expectedQuoteFingerprint: 'a'.repeat(64),
        customerPhone: '(85) 99999-9999',
      }),
      storeSlug: 'loja-a',
      idempotencyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mocks.dispatchCommittedOrderEvents).toHaveBeenCalledWith({
      eventIds: ['outbox-a'],
      publishDirect: expect.any(Function),
    });
  });

  it('não publica novo evento ao recuperar pedido idempotente', async () => {
    mocks.createOrder.mockResolvedValue({
      id: 'order-a',
      storeId: 'store-a',
      publicToken: 'public-token',
      orderNumber: 10,
      paymentReportToken: 'payment-report-token',
      created: false,
      outboxEventIds: [],
    });

    const result = await createOrderAction('loja-a', checkout);

    expect(result.success).toBe(true);
    expect(mocks.dispatchCommittedOrderEvents).not.toHaveBeenCalled();
  });

  it('propaga conflito idempotente como CART_INVALID sem publicar evento', async () => {
    mocks.createOrder.mockRejectedValue(
      new CheckoutError(
        'CART_INVALID',
        'Esta tentativa de pedido já foi usada com outros dados.',
        409,
      ),
    );

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'CART_INVALID',
        message: 'Esta tentativa de pedido já foi usada com outros dados.',
      },
    });
    expect(mocks.dispatchCommittedOrderEvents).not.toHaveBeenCalled();
  });

  it('propaga QUOTE_CHANGED com a nova cotação sem mascarar o contrato público', async () => {
    mocks.createOrder.mockRejectedValue(
      new QuoteChangedError({
        quoteFingerprint: 'b'.repeat(64),
        total: 2500,
      }),
    );

    const result = await createOrderAction('loja-a', checkout);

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'QUOTE_CHANGED',
        details: [
          {
            quote: {
              quoteFingerprint: 'b'.repeat(64),
              total: 2500,
            },
          },
        ],
      },
    });
    expect(mocks.dispatchCommittedOrderEvents).not.toHaveBeenCalled();
  });
});
