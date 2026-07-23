import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rateLimitCheck: vi.fn(),
  reportCustomerPixPayment: vi.fn(),
  dispatchCommittedOrderEvents: vi.fn(),
  triggerPaymentUpdated: vi.fn(),
}));

vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { reportPayment: { maxAttempts: 5, windowInSeconds: 60 } },
  getRateLimiter: () => ({ check: mocks.rateLimitCheck }),
}));
vi.mock('@/server/services/order-payment.service', () => ({
  reportCustomerPixPayment: mocks.reportCustomerPixPayment,
}));
vi.mock('@/server/services/order-event-dispatch.service', () => ({
  dispatchCommittedOrderEvents: mocks.dispatchCommittedOrderEvents,
}));
vi.mock('@/lib/pusher/server', () => ({
  triggerNewOrder: vi.fn(),
  triggerPaymentUpdated: mocks.triggerPaymentUpdated,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.10' }),
}));

import { reportPixPaymentAction } from '@/features/orders/actions';

const reportToken = '4da03571-bffd-45ef-8c44-20686c487838';

describe('reportPixPaymentAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true });
    mocks.reportCustomerPixPayment.mockResolvedValue({
      orderId: 'order-a',
      storeId: 'store-a',
      status: 'PENDING',
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      version: 2,
      paymentUpdated: true,
      outboxEventIds: ['outbox-a'],
    });
    mocks.dispatchCommittedOrderEvents.mockResolvedValue({ notificationPending: false });
  });

  it('valida o token antes de consultar rate limit ou banco', async () => {
    const result = await reportPixPaymentAction({ reportToken: 'inválido' });

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
    expect(mocks.reportCustomerPixPayment).not.toHaveBeenCalled();
  });

  it('usa chave de rate limit derivada sem expor o bearer token', async () => {
    await reportPixPaymentAction({ reportToken });

    const identifier = mocks.rateLimitCheck.mock.calls.find(
      ([input]) => !input.identifier.startsWith('report-payment:ip:'),
    )?.[0].identifier as string;
    expect(identifier).toMatch(/^report-payment:[a-f0-9]{64}$/);
    expect(identifier).not.toContain(reportToken);
  });

  it('retorna sucesso funcional mesmo com notificação pendente', async () => {
    mocks.dispatchCommittedOrderEvents.mockResolvedValue({ notificationPending: true });

    const result = await reportPixPaymentAction({ reportToken });

    expect(result).toEqual({
      success: true,
      data: {
        paymentStatus: 'CUSTOMER_REPORTED_PAID',
        version: 2,
        notificationPending: true,
      },
    });
    expect(mocks.dispatchCommittedOrderEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: ['outbox-a'] }),
    );
  });

  it('bloqueia excesso de relatos antes da transação', async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false });

    const result = await reportPixPaymentAction({ reportToken });

    expect(result).toMatchObject({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
    expect(mocks.reportCustomerPixPayment).not.toHaveBeenCalled();
  });

  it('falha fechado sem consultar o banco quando o limiter está indisponível', async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false, unavailable: true });

    const result = await reportPixPaymentAction({ reportToken });

    expect(result).toMatchObject({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
    expect(mocks.reportCustomerPixPayment).not.toHaveBeenCalled();
  });
});
