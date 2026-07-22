import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmManualPayment } from '@/server/services/order-payment.service';
import type { OrderMutationContext } from '@/server/services/order-mutation.types';

const mocks = vi.hoisted(() => {
  const tx = {
    order: { findFirst: vi.fn(), updateMany: vi.fn() },
    payment: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));

const context: OrderMutationContext = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  userId: 'user-a',
  userName: 'Gerente',
  canConfirmPayment: true,
};

function pendingOrder() {
  return {
    id: 'order-a',
    storeId: 'store-a',
    status: 'READY',
    paymentStatus: 'PENDING',
    paymentMethod: 'PIX',
    version: 4,
    payment: { id: 'payment-a', status: 'PENDING', method: 'PIX' },
  };
}

describe('OrderPaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.order.findFirst.mockResolvedValue(pendingOrder());
    mocks.tx.order.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit-a' });
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
});
