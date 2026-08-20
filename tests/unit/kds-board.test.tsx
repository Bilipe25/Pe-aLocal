import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KdsBoard } from '@/components/kds/kds-board';
import type { KdsOrderDTO, KdsSnapshotDTO } from '@/types/kds';

const mocks = vi.hoisted(() => ({
  snapshot: null as KdsSnapshotDTO | null,
  realtimeHandlers: null as null | {
    onNewOrder: (event: { orderId: string; orderNumber: number }) => void;
    onOrderUpdated: (event: { orderId: string }) => void;
    onPaymentUpdated: (event: { orderId: string }) => void;
  },
  startPreparation: vi.fn(),
  markReady: vi.fn(),
  undo: vi.fn(),
  playSound: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ComponentProps<'img'> & { priority?: boolean }) => {
    void _priority;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img {...props} alt={props.alt ?? ''} />
    );
  },
}));

vi.mock('@/hooks/use-kds-orders', () => ({
  kdsQueryKeys: {
    snapshot: (storeId: string, authorizationScope: string) => [
      'kds-orders',
      storeId,
      authorizationScope,
    ],
    store: (storeId: string) => ['kds-orders', storeId],
  },
  useKdsOrders: () => ({
    data: mocks.snapshot,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-order-realtime', () => ({
  useOrderRealtime: (_storeId: string, handlers: NonNullable<typeof mocks.realtimeHandlers>) => {
    mocks.realtimeHandlers = handlers;
    return 'connected';
  },
}));

vi.mock('@/hooks/use-order-notification-sound', () => ({
  useOrderNotificationSound: () => ({
    enabled: true,
    isActivating: false,
    error: null,
    toggle: vi.fn(),
    play: mocks.playSound,
  }),
}));

vi.mock('@/features/orders/admin-actions', () => ({
  startOrderPreparationAction: mocks.startPreparation,
  markOrderReadyAction: mocks.markReady,
  undoLastOrderTransitionAction: mocks.undo,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

function order(status: KdsOrderDTO['status'], id = `order-${status}`): KdsOrderDTO {
  return {
    id,
    orderNumber: status === 'CONFIRMED' ? 101 : status === 'PREPARING' ? 102 : 103,
    modality: 'PICKUP',
    diningTableLabel: null,
    status,
    version: 7,
    stageStartedAt: '2026-08-18T12:00:00.000Z',
    stageAlertThresholdMinutes: 5,
    notes: 'Sem cebola',
    items: [
      {
        id: `item-${id}`,
        productName: 'Smash Bacon',
        quantity: 2,
        notes: 'Bem passado',
        options: [{ id: 'option-a', name: 'Cheddar', groupName: 'Queijo' }],
      },
    ],
  };
}

function snapshot(items: KdsOrderDTO[]): KdsSnapshotDTO {
  const todo = items.filter((item) => item.status === 'CONFIRMED');
  const making = items.filter((item) => item.status === 'PREPARING');
  const ready = items.filter((item) => item.status === 'READY');
  return {
    lanes: {
      TODO: { key: 'TODO', items: todo, total: todo.length },
      MAKING: { key: 'MAKING', items: making, total: making.length },
      READY: { key: 'READY', items: ready, total: ready.length },
    },
    total: items.length,
    truncated: false,
    estimatedTimeMaxMinutes: 30,
    updatedAt: '2026-08-18T12:04:00.000Z',
  };
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <KdsBoard
        storeId="store-a"
        storeName="Burger do Zé"
        authorizationScope="user-a:OWNER"
        initialSnapshot={mocks.snapshot!}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('Tela da cozinha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.realtimeHandlers = null;
    mocks.snapshot = snapshot([order('CONFIRMED'), order('PREPARING'), order('READY')]);
    mocks.startPreparation.mockResolvedValue({
      success: true,
      data: {
        orderId: 'order-CONFIRMED',
        status: 'PREPARING',
        version: 8,
        statusChangedAt: '2026-08-18T12:05:00.000Z',
        notificationPending: false,
      },
    });
    mocks.markReady.mockResolvedValue({
      success: true,
      data: {
        orderId: 'order-PREPARING',
        status: 'READY',
        version: 8,
        statusChangedAt: '2026-08-18T12:05:00.000Z',
        notificationPending: false,
      },
    });
    mocks.undo.mockResolvedValue({
      success: true,
      data: {
        orderId: 'order-PREPARING',
        status: 'CONFIRMED',
        version: 9,
        statusChangedAt: '2026-08-18T12:06:00.000Z',
      },
    });
  });

  it('renderiza somente as três etapas oficiais e todos os detalhes de preparo', () => {
    renderBoard();

    expect(screen.getByRole('heading', { name: 'A fazer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em preparo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prontos' })).toBeInTheDocument();
    expect(screen.getAllByText('Smash Bacon')).toHaveLength(3);
    expect(screen.getAllByText('Queijo: Cheddar')).toHaveLength(3);
    expect(screen.getAllByText('Bem passado')).toHaveLength(3);
    expect(screen.getAllByText('Sem cebola')).toHaveLength(3);
  });

  it('usa as transições oficiais com a versão esperada', async () => {
    const { queryClient } = renderBoard();
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(screen.getByRole('button', { name: /^Iniciar preparo/ }));
    await waitFor(() =>
      expect(mocks.startPreparation).toHaveBeenCalledWith({
        orderId: 'order-CONFIRMED',
        expectedVersion: 7,
      }),
    );
    expect(setQueryData).toHaveBeenCalledWith(
      ['kds-orders', 'store-a', 'user-a:OWNER'],
      expect.any(Function),
    );
    expect(setQueryData.mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0],
    );

    fireEvent.click(screen.getByRole('button', { name: /^Marcar como pronto/ }));
    await waitFor(() =>
      expect(mocks.markReady).toHaveBeenCalledWith({
        orderId: 'order-PREPARING',
        expectedVersion: 7,
      }),
    );
  });

  it('recupera conflito concorrente com a mensagem operacional combinada', async () => {
    mocks.markReady.mockResolvedValue({
      success: false,
      error: { code: 'CONFLICT', message: 'mensagem interna' },
    });
    const { queryClient } = renderBoard();
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');

    fireEvent.click(screen.getByRole('button', { name: /^Marcar como pronto/ }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Este pedido já foi atualizado em outro dispositivo.',
      ),
    );
    expect(mocks.markReady).toHaveBeenCalledOnce();
    expect(setQueryData).not.toHaveBeenCalled();
  });

  it('invalida o snapshot ao receber atualização da Central ou de outro KDS', () => {
    const { queryClient } = renderBoard();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => mocks.realtimeHandlers?.onOrderUpdated({ orderId: 'order-CONFIRMED' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kds-orders', 'store-a'] });
  });

  it('move e remove cards quando o snapshot autoritativo muda, sem refresh manual', () => {
    const { rerender, queryClient } = renderBoard();
    expect(screen.getByRole('heading', { name: '#101' })).toBeInTheDocument();

    mocks.snapshot = snapshot([{ ...order('CONFIRMED'), status: 'PREPARING' }, order('READY')]);
    rerender(
      <QueryClientProvider client={queryClient}>
        <KdsBoard
          storeId="store-a"
          storeName="Burger do Zé"
          authorizationScope="user-a:OWNER"
          initialSnapshot={mocks.snapshot}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: '#101' }).closest('article')).toHaveAttribute(
      'data-order-status',
      'PREPARING',
    );

    mocks.snapshot = snapshot([order('READY')]);
    rerender(
      <QueryClientProvider client={queryClient}>
        <KdsBoard
          storeId="store-a"
          storeName="Burger do Zé"
          authorizationScope="user-a:OWNER"
          initialSnapshot={mocks.snapshot}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('heading', { name: '#101' })).not.toBeInTheDocument();
  });

  it('toca uma vez quando um pedido entra em CONFIRMED, mas não no carregamento inicial', async () => {
    mocks.snapshot = snapshot([order('PREPARING', 'order-a')]);
    const { rerender, queryClient } = renderBoard();
    expect(mocks.playSound).not.toHaveBeenCalled();

    mocks.snapshot = snapshot([{ ...order('CONFIRMED', 'order-a'), status: 'CONFIRMED' }]);
    rerender(
      <QueryClientProvider client={queryClient}>
        <KdsBoard
          storeId="store-a"
          storeName="Burger do Zé"
          authorizationScope="user-a:OWNER"
          initialSnapshot={mocks.snapshot}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mocks.playSound).toHaveBeenCalledOnce());
  });
});
