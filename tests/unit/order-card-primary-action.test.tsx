import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderCardPrimaryAction } from '@/components/dashboard/order-card-primary-action';
import type { OrderQueueItemDTO } from '@/types/order-query';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/orders/admin-actions', () => ({
  acceptOrderAction: mocks.accept,
  completeOrderAction: vi.fn(),
  confirmPaymentAction: vi.fn(),
  dispatchOrderAction: vi.fn(),
  markOrderReadyAction: vi.fn(),
  startOrderPreparationAction: vi.fn(),
  undoLastOrderTransitionAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: vi.fn(),
  },
}));

const pendingOrder: OrderQueueItemDTO = {
  id: '00000000-0000-0000-0000-000000000001',
  orderNumber: 1042,
  customerDisplayName: 'Mariana',
  modality: 'PICKUP',
  diningTableLabel: null,
  paymentMethod: 'PIX',
  paymentStatus: 'PENDING',
  status: 'PENDING',
  total: 6890,
  itemCount: 2,
  createdAt: '2026-07-31T12:00:00.000Z',
  statusChangedAt: '2026-07-31T12:00:00.000Z',
  stageStartedAt: '2026-07-31T12:00:00.000Z',
  stageLabel: 'Recebido',
  stageAlerts: [],
  nextActionLabel: 'Aceitar pedido',
  version: 4,
  hasCustomerNotes: false,
  hasOperationalAlert: false,
};

describe('ação operacional direta do card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accept.mockResolvedValue({
      success: true,
      data: { version: 5, notificationPending: false },
    });
  });

  it('executa somente a transição autorizada pelo DTO e envia a versão esperada', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const onOrderChanged = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <OrderCardPrimaryAction
          order={pendingOrder}
          storeId="store-a"
          authorizationScope="user-a:OWNER"
          onOrderChanged={onOrderChanged}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar pedido' }));

    await waitFor(() =>
      expect(mocks.accept).toHaveBeenCalledWith({
        orderId: pendingOrder.id,
        expectedVersion: 4,
      }),
    );
    expect(invalidate).toHaveBeenCalled();
    expect(onOrderChanged).toHaveBeenCalledWith(pendingOrder.id);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('trata falha de transporte sem deixar a ação em carregamento', async () => {
    mocks.accept.mockRejectedValueOnce(new Error('network'));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <OrderCardPrimaryAction
          order={pendingOrder}
          storeId="store-a"
          authorizationScope="user-a:OWNER"
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar pedido' }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Não foi possível atualizar o pedido. Verifique sua conexão e tente novamente.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Aceitar pedido' })).toBeEnabled();
  });

  it('não renderiza transição quando o servidor não concedeu ação', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OrderCardPrimaryAction
          order={{ ...pendingOrder, nextActionLabel: null }}
          storeId="store-a"
          authorizationScope="user-a:ATTENDANT"
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
