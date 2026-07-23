import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  confirmManualPayment,
  markPaymentFailed,
  refundPayment,
  reportCustomerPixPayment,
  retryFailedPayment,
} from '@/server/services/order-payment.service';
import type { OrderMutationContext } from '@/server/services/order-mutation.types';

const mocks = vi.hoisted(() => {
  const tx = {
    order: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    payment: { updateMany: vi.fn() },
    paymentStatusHistory: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    orderOutboxEvent: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction, order: mocks.tx.order }),
}));

const context: OrderMutationContext = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  userId: 'user-a',
  userName: 'Gerente',
  canConfirmPayment: true,
  canRefundPayment: true,
};

function pendingOrder() {
  return {
    id: 'order-a',
    storeId: 'store-a',
    orderNumber: 12,
    status: 'READY',
    paymentStatus: 'PENDING',
    paymentMethod: 'PIX',
    tenantId: 'tenant-a',
    total: 2500,
    version: 4,
    paymentReportExpiresAt: new Date(Date.now() + 60_000),
    payment: { id: 'payment-a', status: 'PENDING', method: 'PIX', amount: 2500 },
  };
}

describe('OrderPaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.order.findFirst.mockResolvedValue(pendingOrder());
    mocks.tx.order.findUnique.mockResolvedValue(pendingOrder());
    mocks.tx.order.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.paymentStatusHistory.create.mockResolvedValue({ id: 'payment-history-a' });
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit-a' });
    mocks.tx.orderOutboxEvent.create.mockResolvedValue({ id: 'outbox-a' });
  });

  it('confirma Order e Payment com a mesma versão e auditoria atômica', async () => {
    const result = await confirmManualPayment(context, {
      orderId: 'order-a',
      expectedVersion: 4,
    });

    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          paymentStatus: 'PENDING',
          version: 4,
        }),
        data: { paymentStatus: 'PAID', version: { increment: 1 } },
      }),
    );
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        data: expect.objectContaining({ status: 'PAID', confirmedBy: 'user-a' }),
      }),
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYMENT_CONFIRMED',
          entity: 'Payment',
          entityId: 'payment-a',
        }),
      }),
    );
    expect(result).toMatchObject({ paymentStatus: 'PAID', version: 5 });
    expect(result.outboxEventIds).toEqual(['outbox-a']);
    expect(mocks.tx.orderOutboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditLogId: 'audit-a',
          eventType: 'PAYMENT_UPDATED',
          aggregateVersion: 5,
        }),
      }),
    );
  });

  it('revalida a permissão financeira dentro do serviço', async () => {
    await expect(
      confirmManualPayment(
        { ...context, canConfirmPayment: false },
        { orderId: 'order-a', expectedVersion: 4 },
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('bloqueia divergência entre Order e Payment sem escrever auditoria', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      payment: { id: 'payment-a', status: 'PAID', method: 'PIX' },
    });

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'ORDER_PAYMENT_INCONSISTENT' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('bloqueia divergência de valor entre Order e Payment', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      payment: { ...pendingOrder().payment, amount: 2400 },
    });

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'ORDER_PAYMENT_INCONSISTENT' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('confirma PIX informado pelo cliente sem duplicar o relato', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      payment: { ...pendingOrder().payment, status: 'CUSTOMER_REPORTED_PAID' },
    });

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).resolves.toMatchObject({ paymentStatus: 'PAID', version: 5 });
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CUSTOMER_REPORTED_PAID' }),
        data: expect.objectContaining({ status: 'PAID', confirmedBy: 'user-a' }),
      }),
    );
  });

  it('não permite confirmação manual antecipada de cartão na entrega', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      paymentMethod: 'CARD_ON_DELIVERY',
      payment: { ...pendingOrder().payment, method: 'CARD_ON_DELIVERY' },
    });

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE_ERROR' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejeita versão obsoleta antes de qualquer escrita', async () => {
    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 3 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('não aceita confirmação em pedido cancelado', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({ ...pendingOrder(), status: 'CANCELLED' });

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).rejects.toThrow('cancelado não pode ser marcado como pago');
  });

  it('falha de auditoria impede o retorno de sucesso', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      confirmManualPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).rejects.toThrow('audit unavailable');
  });

  it('rejeita um PIX informado com motivo seguro e auditoria', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      payment: { ...pendingOrder().payment, status: 'CUSTOMER_REPORTED_PAID' },
    });

    const result = await markPaymentFailed(context, {
      orderId: 'order-a',
      expectedVersion: 4,
      reasonCode: 'PAYMENT_NOT_IDENTIFIED',
      note: 'Comprovante não corresponde ao recebimento.',
    });

    expect(result).toMatchObject({ paymentStatus: 'FAILED', version: 5 });
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReasonCode: 'PAYMENT_NOT_IDENTIFIED',
          failedAt: expect.any(Date),
        }),
      }),
    );
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PAYMENT_FAILED' }),
      }),
    );
    expect(mocks.tx.paymentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'CUSTOMER_REPORTED_PAID',
          toStatus: 'FAILED',
          actorNameSnapshot: 'Gerente',
          note: 'Comprovante não corresponde ao recebimento.',
        }),
      }),
    );
    expect(mocks.tx.paymentStatusHistory.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.payment.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('reabre explicitamente um PIX com falha para nova análise', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      paymentStatus: 'FAILED',
      payment: { ...pendingOrder().payment, status: 'FAILED' },
    });

    await expect(
      retryFailedPayment(context, { orderId: 'order-a', expectedVersion: 4 }),
    ).resolves.toMatchObject({ paymentStatus: 'PENDING', version: 5 });
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          failedAt: null,
          failureReasonCode: null,
        }),
      }),
    );
  });

  it('registra reembolso integral somente com permissão financeira', async () => {
    const paidOrder = {
      ...pendingOrder(),
      paymentStatus: 'PAID',
      payment: { ...pendingOrder().payment, status: 'PAID' },
    };
    mocks.tx.order.findFirst.mockResolvedValue(paidOrder);

    await expect(
      refundPayment(
        { ...context, canRefundPayment: false },
        {
          orderId: 'order-a',
          expectedVersion: 4,
          reasonCode: 'CUSTOMER_REQUEST',
        },
      ),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    expect(mocks.transaction).not.toHaveBeenCalled();

    const result = await refundPayment(context, {
      orderId: 'order-a',
      expectedVersion: 4,
      reasonCode: 'CUSTOMER_REQUEST',
    });
    expect(result).toMatchObject({ paymentStatus: 'REFUNDED', version: 5 });
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REFUNDED',
          refundedBy: 'user-a',
          refundAmount: 2500,
          refundReasonCode: 'CUSTOMER_REQUEST',
        }),
      }),
    );
  });

  it('permite reembolso corretivo de pagamento pago em pedido já cancelado', async () => {
    mocks.tx.order.findFirst.mockResolvedValue({
      ...pendingOrder(),
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      payment: { ...pendingOrder().payment, status: 'PAID' },
    });

    await expect(
      refundPayment(context, {
        orderId: 'order-a',
        expectedVersion: 4,
        reasonCode: 'ORDER_CANCELLATION',
      }),
    ).resolves.toMatchObject({ paymentStatus: 'REFUNDED' });
  });

  it('registra relato público de PIX uma vez e trata retry como idempotente', async () => {
    const first = await reportCustomerPixPayment('00000000-0000-4000-8000-000000000001');
    expect(first).toMatchObject({ paymentStatus: 'CUSTOMER_REPORTED_PAID', version: 5 });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: undefined,
          action: 'PAYMENT_REPORTED',
          metadata: expect.objectContaining({ source: 'CUSTOMER' }),
        }),
      }),
    );

    vi.clearAllMocks();
    mocks.tx.order.findUnique.mockResolvedValue({
      ...pendingOrder(),
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      version: 5,
      payment: { ...pendingOrder().payment, status: 'CUSTOMER_REPORTED_PAID' },
    });
    const retry = await reportCustomerPixPayment('00000000-0000-4000-8000-000000000001');
    expect(retry).toMatchObject({ paymentStatus: 'CUSTOMER_REPORTED_PAID', version: 5 });
    expect(retry.outboxEventIds).toEqual([]);
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('reconcilia relato público concorrente sem criar segundo evento', async () => {
    const pending = pendingOrder();
    mocks.tx.order.findUnique.mockResolvedValueOnce(pending).mockResolvedValueOnce({
      id: pending.id,
      storeId: pending.storeId,
      status: pending.status,
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      version: 5,
    });
    mocks.tx.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await reportCustomerPixPayment('00000000-0000-4000-8000-000000000001');

    expect(result).toMatchObject({
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      version: 5,
      outboxEventIds: [],
    });
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('não aceita token de relato para dinheiro nem token expirado', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      ...pendingOrder(),
      paymentMethod: 'CASH',
      payment: { ...pendingOrder().payment, method: 'CASH' },
    });
    await expect(reportCustomerPixPayment('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'Somente pagamentos Pix',
    );

    mocks.tx.order.findUnique.mockResolvedValue({
      ...pendingOrder(),
      paymentReportExpiresAt: new Date(Date.now() - 1_000),
    });
    await expect(reportCustomerPixPayment('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'prazo para informar',
    );
  });

  it('mantém sucesso idempotente de relato já salvo depois da expiração', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      ...pendingOrder(),
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      paymentReportExpiresAt: new Date(Date.now() - 1_000),
      payment: {
        ...pendingOrder().payment,
        status: 'CUSTOMER_REPORTED_PAID',
      },
    });

    await expect(
      reportCustomerPixPayment('00000000-0000-4000-8000-000000000001'),
    ).resolves.toMatchObject({
      paymentStatus: 'CUSTOMER_REPORTED_PAID',
      paymentUpdated: false,
    });
  });
});
