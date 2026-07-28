import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  useCustomerOrderTracking: vi.fn(),
}));

vi.mock('@/hooks/use-customer-order-tracking', () => ({
  useCustomerOrderTracking: mocks.useCustomerOrderTracking,
}));

import { CustomerOrderTracking } from '@/components/storefront/customer-order-tracking';
import {
  CustomerOrderAccessBoundary,
  useExpireCustomerOrderAccess,
} from '@/components/storefront/customer-order-access-boundary';

const initialState = {
  orderNumber: 42,
  modality: 'PICKUP' as const,
  status: 'PREPARING' as const,
  paymentStatus: 'PENDING' as const,
  version: 3,
  statusChangedAt: '2026-07-22T12:05:00.000Z',
  updatedAt: '2026-07-22T12:06:00.000Z',
  estimate: {
    label: 'Previsão para retirada',
    minAt: '2026-07-22T12:35:00.000Z',
    maxAt: '2026-07-22T12:55:00.000Z',
  },
  cancellationMessage: null,
};

describe('CustomerOrderTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCustomerOrderTracking.mockReturnValue({
      state: initialState,
      expired: false,
      connection: 'connected',
      lastSynchronizedAt: initialState.updatedAt,
      error: null,
      isRefreshing: false,
      refresh: mocks.refresh,
    });
  });

  it('restringe aria-live ao resumo conciso do status', () => {
    const { container } = render(
      <CustomerOrderTracking
        publicToken="4da03571-bffd-45ef-8c44-20686c487838"
        storeSlug="burger-do-ze"
        channelName={`private-order-${'a'.repeat(64)}`}
        timeZone="America/Fortaleza"
        initialState={initialState}
      />,
    );

    const section = container.querySelector('section');
    const liveRegion = screen.getByRole('status');

    expect(section).not.toHaveAttribute('aria-live');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(liveRegion).toHaveTextContent('Em preparo. Seu pedido está sendo preparado.');
    expect(liveRegion).not.toHaveTextContent('Atualizado às');
    expect(liveRegion).not.toHaveTextContent('Pedido #42');
  });

  it('substitui imediatamente a comanda inteira por uma tela genérica ao expirar', () => {
    function ExpireAccessButton() {
      const expireAccess = useExpireCustomerOrderAccess();
      return (
        <button type="button" onClick={expireAccess}>
          Simular expiração
        </button>
      );
    }

    render(
      <CustomerOrderAccessBoundary storeSlug="burger-do-ze">
        <div>
          <p>Pedido #42</p>
          <p>Rua privada, 123</p>
          <ExpireAccessButton />
        </div>
      </CustomerOrderAccessBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Simular expiração' }));

    expect(screen.getByRole('heading', { name: 'Acompanhamento indisponível' })).toBeVisible();
    expect(screen.queryByText('Pedido #42')).not.toBeInTheDocument();
    expect(screen.queryByText('Rua privada, 123')).not.toBeInTheDocument();
  });
});
