import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StatusActions } from '@/components/dashboard/status-actions';
import { orderQueryKeys } from '@/hooks/use-orders';
import type { OrderDetailsDTO } from '@/types/order-query';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  confirmPayment: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/orders/admin-actions', () => ({
  acceptOrderAction: mocks.accept,
  cancelOrderAction: vi.fn(),
  completeOrderAction: vi.fn(),
  confirmPaymentAction: mocks.confirmPayment,
  dispatchOrderAction: vi.fn(),
  markOrderReadyAction: vi.fn(),
  startOrderPreparationAction: vi.fn(),
  markPaymentFailedAction: vi.fn(),
  refundPaymentAction: vi.fn(),
  retryFailedPaymentAction: vi.fn(),
  undoLastOrderTransitionAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: vi.fn(),
  },
}));

const order = {
  id: '00000000-0000-0000-0000-000000000001',
  orderNumber: 1042,
  version: 4,
  modality: 'PICKUP',
  payment: { method: 'CASH', status: 'PENDING', amount: null },
  totals: { subtotal: 1_000, discount: 0, deliveryFee: 0, total: 1_000 },
  allowedActions: {
    accept: true,
    startPreparation: false,
    markReady: false,
    dispatch: false,
    complete: false,
    cancel: false,
    confirmPayment: false,
    markPaymentFailed: false,
    retryPayment: false,
    refundPayment: false,
  },
} as OrderDetailsDTO;

describe('ações de status no drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accept.mockResolvedValue({
      success: true,
      data: { version: 5, notificationPending: false },
    });
    mocks.confirmPayment.mockResolvedValue({
      success: true,
      data: { version: 5, notificationPending: false },
    });
  });

  it('invalida o board e informa o pedido alterado depois da transição', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const onOrderChanged = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <StatusActions
          order={order}
          storeId="store-a"
          authorizationScope="user-a:OWNER"
          onOrderChanged={onOrderChanged}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar pedido' }));

    await waitFor(() => expect(onOrderChanged).toHaveBeenCalledWith(order.id));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.boardStore('store-a') });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
  it('atualiza o board e o pedido selecionado depois de confirmar o pagamento', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const onOrderChanged = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <StatusActions
          order={{
            ...order,
            payment: { ...order.payment, method: 'PIX', status: 'PENDING', amount: null },
            allowedActions: { ...order.allowedActions, accept: false, confirmPayment: true },
          }}
          storeId="store-a"
          authorizationScope="user-a:OWNER"
          onOrderChanged={onOrderChanged}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar pagamento' }));

    await waitFor(() => expect(mocks.confirmPayment).toHaveBeenCalledOnce());
    expect(onOrderChanged).toHaveBeenCalledWith(order.id);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.boardStore('store-a') });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Pagamento confirmado.');
  });

  it('prioriza a confirmação do Pix sem bloquear um despacho permitido pelo workflow', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <StatusActions
          order={{
            ...order,
            status: 'READY',
            modality: 'DELIVERY',
            payment: { ...order.payment, method: 'PIX', status: 'PENDING', amount: null },
            allowedActions: {
              ...order.allowedActions,
              accept: false,
              dispatch: true,
              cancel: true,
              confirmPayment: true,
            },
          }}
          storeId="store-a"
          authorizationScope="user-a:OWNER"
        />
      </QueryClientProvider>,
    );

    const confirmPayment = screen.getByRole('button', { name: 'Confirmar pagamento' });
    const dispatch = screen.getByRole('button', { name: 'Despachar para entrega' });
    const cancel = screen.getByRole('button', { name: 'Cancelar pedido' });

    expect(screen.getByText(/O Pix ainda está pendente/)).toBeInTheDocument();
    expect(confirmPayment).toHaveClass('bg-info');
    expect(confirmPayment.closest('.order-detail-payment-actions')).toBeInTheDocument();
    expect(dispatch.closest('.order-detail-primary-actions')).toBeInTheDocument();
    expect(confirmPayment).toHaveAttribute('aria-describedby', 'pix-payment-priority-hint');
    expect(dispatch).toHaveClass('border', 'border-border');
    expect(dispatch).not.toHaveClass('bg-info');
    expect(dispatch).toHaveAttribute('aria-describedby', 'pix-payment-priority-hint');
    expect(cancel).toHaveClass('text-error');
  });
});
