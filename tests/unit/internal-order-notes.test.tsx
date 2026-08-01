import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InternalOrderNotes } from '@/components/dashboard/internal-order-notes';
import { orderQueryKeys } from '@/hooks/use-orders';
import type { OrderDetailsDTO } from '@/types/order-query';

const mocks = vi.hoisted(() => ({
  addNote: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useNotes: vi.fn(),
}));

vi.mock('@/features/orders/admin-actions', () => ({
  addInternalOrderNoteAction: mocks.addNote,
}));

vi.mock('@/hooks/use-orders', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-orders')>();
  return {
    ...original,
    useOrderInternalNotes: mocks.useNotes,
  };
});

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
  allowedActions: {
    viewHistory: true,
    addInternalNote: true,
  },
} as OrderDetailsDTO;

function renderNotes(onOrderChanged = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <InternalOrderNotes
        order={order}
        storeId="store-a"
        authorizationScope="user-a:OWNER"
        timeZone="America/Fortaleza"
        onOrderChanged={onOrderChanged}
      />
    </QueryClientProvider>,
  );
  return { invalidate, onOrderChanged };
}

describe('observacoes internas do pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useNotes.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it('invalida detalhes e board depois de salvar uma nota', async () => {
    mocks.addNote.mockResolvedValue({
      success: true,
      data: { version: 5, notificationPending: false },
    });
    const { invalidate, onOrderChanged } = renderNotes();

    fireEvent.click(screen.getByRole('button', { name: /internas/i }));
    fireEvent.change(screen.getByLabelText(/Nova observa/i), {
      target: { value: 'Confirmar retirada por telefone.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(mocks.addNote).toHaveBeenCalledOnce());
    expect(onOrderChanged).toHaveBeenCalledWith(order.id);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.boardStore('store-a') });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('trata falha de transporte sem deixar o formulario bloqueado', async () => {
    mocks.addNote.mockRejectedValue(new Error('offline'));
    renderNotes();

    fireEvent.click(screen.getByRole('button', { name: /internas/i }));
    fireEvent.change(screen.getByLabelText(/Nova observa/i), {
      target: { value: 'Cliente aguardando contato.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled();
  });
});
