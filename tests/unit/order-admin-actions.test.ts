import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptOrderAction,
  cancelOrderAction,
  completeOrderAction,
  confirmPaymentAction,
} from '@/features/orders/admin-actions';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  acceptOrder: vi.fn(),
  completeOrder: vi.fn(),
  cancelOrder: vi.fn(),
  confirmManualPayment: vi.fn(),
  triggerOrderUpdated: vi.fn(),
  triggerPaymentUpdated: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({ getDb: vi.fn() }));
vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/services/order-workflow.service', () => ({
  acceptOrder: mocks.acceptOrder,
  startOrderPreparation: vi.fn(),
  markOrderReady: vi.fn(),
  dispatchOrder: vi.fn(),
  completeOrder: mocks.completeOrder,
  cancelOrder: mocks.cancelOrder,
  undoLastOrderTransition: vi.fn(),
}));
vi.mock('@/server/services/order-payment.service', () => ({
  confirmManualPayment: mocks.confirmManualPayment,
}));
vi.mock('@/lib/pusher/server', () => ({
  triggerOrderUpdated: mocks.triggerOrderUpdated,
  triggerPaymentUpdated: mocks.triggerPaymentUpdated,
}));

const input = {
  orderId: '4da03571-bffd-45ef-8c44-20686c487838',
  expectedVersion: 2,
};

const mutationResult = {
  orderId: input.orderId,
  storeId: 'store-a',
  status: 'CONFIRMED' as const,
  paymentStatus: 'PENDING' as const,
  version: 3,
  paymentUpdated: false,
};

describe('ações administrativas de pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue({
      session: {
        tenantId: 'tenant-a',
        tenantRole: 'MANAGER',
        userId: 'user-a',
        name: 'Gerente',
      },
      store: { id: 'store-a' },
    });
    mocks.acceptOrder.mockResolvedValue(mutationResult);
    mocks.completeOrder.mockResolvedValue({ ...mutationResult, status: 'DELIVERED' });
    mocks.cancelOrder.mockResolvedValue({ ...mutationResult, status: 'CANCELLED' });
    mocks.confirmManualPayment.mockResolvedValue({
      ...mutationResult,
      paymentStatus: 'PAID',
      paymentUpdated: true,
    });
    mocks.triggerOrderUpdated.mockResolvedValue({});
    mocks.triggerPaymentUpdated.mockResolvedValue({});
  });

  it('valida o input antes de consultar sessão ou banco', async () => {
    const result = await acceptOrderAction({ orderId: 'inválido', expectedVersion: -1 });

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.requireActiveStoreContext).not.toHaveBeenCalled();
    expect(mocks.acceptOrder).not.toHaveBeenCalled();
  });

  it('aceite exige ACCEPT_ORDERS e passa somente contexto confiável ao serviço', async () => {
    const result = await acceptOrderAction(input);

    expect(result.success).toBe(true);
    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.ACCEPT_ORDERS);
    expect(mocks.acceptOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        userId: 'user-a',
      }),
      input,
    );
  });

  it('cancelamento exige CANCEL_ORDERS', async () => {
    await cancelOrderAction({ ...input, reasonCode: 'CUSTOMER_REQUEST' });

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.CANCEL_ORDERS);
  });

  it('conclusão exige COMPLETE_ORDERS', async () => {
    await completeOrderAction(input);

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.COMPLETE_ORDERS);
  });

  it('confirmação financeira exige CONFIRM_MANUAL_PAYMENT', async () => {
    await confirmPaymentAction(input);

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(
      Permission.CONFIRM_MANUAL_PAYMENT,
    );
    expect(mocks.confirmManualPayment).toHaveBeenCalledOnce();
  });

  it('falha do Pusher não transforma uma operação persistida em erro', async () => {
    mocks.triggerOrderUpdated.mockRejectedValue(new Error('Pusher indisponível'));

    const result = await acceptOrderAction(input);

    expect(result).toMatchObject({
      success: true,
      data: {
        status: 'CONFIRMED',
        version: 3,
        notificationPending: true,
      },
    });
  });
});
