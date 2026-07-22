import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptOrder,
  cancelOrder,
  completeOrder,
  undoLastOrderTransition,
  type OrderMutationContext,
} from '@/server/services/order-workflow.service';

const mocks = vi.hoisted(() => {
  const tx = {
    order: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    payment: {
      updateMany: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
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
  userName: 'Operador',
  canConfirmPayment: true,
};

function orderSnapshot(
  overrides: Partial<{
    status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
    paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
    paymentMethod: 'PIX' | 'CASH' | 'CARD_ON_DELIVERY';
    modality: 'PICKUP' | 'DELIVERY';
    version: number;
  }> = {},
) {
  const snapshot = {
    id: 'order-a',
    storeId: 'store-a',
    status: 'PENDING' as const,
    paymentStatus: 'PENDING' as const,
    paymentMethod: 'PIX' as const,
    modality: 'PICKUP' as const,
    version: 0,
    ...overrides,
  };

  return {
    ...snapshot,
    payment: {
      status: snapshot.paymentStatus,
      method: snapshot.paymentMethod,
    },
  };
}

describe('OrderWorkflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.order.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.orderStatusHistory.create.mockResolvedValue({ id: 'history-new' });
  });

  it('aceita pedido com CAS por tenant, loja, status e versão', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(orderSnapshot());

    const result = await acceptOrder(context, { orderId: 'order-a', expectedVersion: 0 });

    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'order-a',
          tenantId: 'tenant-a',
          storeId: 'store-a',
          status: 'PENDING',
          version: 0,
        }),
        data: expect.objectContaining({
          status: 'CONFIRMED',
          version: { increment: 1 },
        }),
      }),
    );
    expect(mocks.tx.orderStatusHistory.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'CONFIRMED', version: 1 });
  });

  it('gera conflito sem criar histórico quando a versão ficou obsoleta', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(orderSnapshot());
    mocks.tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      acceptOrder(context, { orderId: 'order-a', expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('identifica versão obsoleta antes de validar a transição atual', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ status: 'CONFIRMED', version: 1 }),
    );

    await expect(
      acceptOrder(context, { orderId: 'order-a', expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejeita transição inválida antes de qualquer escrita', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(orderSnapshot());

    await expect(
      completeOrder(context, { orderId: 'order-a', expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE_ERROR' });
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('exige PIX pago para concluir', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ status: 'READY', paymentMethod: 'PIX', paymentStatus: 'PENDING' }),
    );

    await expect(
      completeOrder(context, { orderId: 'order-a', expectedVersion: 0 }),
    ).rejects.toThrow('O pagamento via PIX deve estar confirmado');
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('confirma cash pendente atomicamente durante a conclusão', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ status: 'READY', paymentMethod: 'CASH', paymentStatus: 'PENDING' }),
    );

    const result = await completeOrder(context, {
      orderId: 'order-a',
      expectedVersion: 0,
    });

    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DELIVERED', paymentStatus: 'PAID' }),
      }),
    );
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderId: 'order-a', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'PAID', confirmedBy: 'user-a' }),
      }),
    );
    expect(result).toMatchObject({
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentUpdated: true,
    });
  });

  it('não cria histórico quando a atualização financeira concorrente falha', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ status: 'READY', paymentMethod: 'CASH', paymentStatus: 'PENDING' }),
    );
    mocks.tx.payment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      completeOrder(context, { orderId: 'order-a', expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('cancela pedido e pagamento pendentes com motivo na mesma transação', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(orderSnapshot());

    const result = await cancelOrder(context, {
      orderId: 'order-a',
      expectedVersion: 0,
      reasonCode: 'CUSTOMER_REQUEST',
      note: 'Cliente desistiu',
    });

    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          cancellationReasonCode: 'CUSTOMER_REQUEST',
          cancelledById: 'user-a',
        }),
      }),
    );
    expect(mocks.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
    expect(mocks.tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reasonCode: 'CUSTOMER_REQUEST' }),
      }),
    );
    expect(result.paymentStatus).toBe('CANCELLED');
  });

  it('bloqueia cancelamento de pedido pago', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ paymentStatus: 'PAID', paymentMethod: 'PIX' }),
    );

    await expect(
      cancelOrder(context, {
        orderId: 'order-a',
        expectedVersion: 0,
        reasonCode: 'CUSTOMER_REQUEST',
      }),
    ).rejects.toThrow('precisa ser reembolsado');
    expect(mocks.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('desfaz somente a última transição reversível do mesmo usuário', async () => {
    mocks.tx.order.findFirst.mockResolvedValue(
      orderSnapshot({ status: 'PREPARING', paymentStatus: 'PAID', version: 2 }),
    );
    mocks.tx.orderStatusHistory.findFirst.mockResolvedValue({
      id: 'history-a',
      fromStatus: 'CONFIRMED',
      toStatus: 'PREPARING',
      changedById: 'user-a',
      source: 'DASHBOARD',
      isUndo: false,
      createdAt: new Date(),
    });

    const result = await undoLastOrderTransition(context, {
      orderId: 'order-a',
      expectedVersion: 2,
    });

    expect(result).toMatchObject({ status: 'CONFIRMED', version: 3 });
    expect(mocks.tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isUndo: true, revertsHistoryId: 'history-a' }),
      }),
    );
    expect(mocks.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ preparingAt: null }),
      }),
    );
  });
});
