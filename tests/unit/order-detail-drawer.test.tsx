import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDeliveryAddressForOperations,
  OrderDetailModal,
} from '@/components/dashboard/order-detail-modal';

const useOrderDetailsMock = vi.fn();

vi.mock('@/hooks/use-orders', () => ({
  useOrderDetails: (...args: unknown[]) => useOrderDetailsMock(...args),
  useOrderHistory: vi.fn(),
}));

vi.mock('@/components/dashboard/status-actions', () => ({
  StatusActions: () => null,
}));

vi.mock('@/components/dashboard/internal-order-notes', () => ({
  InternalOrderNotes: () => null,
}));

const baseProps = {
  storeId: 'store-1',
  authorizationScope: 'tenant-1:store-1:OWNER',
  timeZone: 'America/Fortaleza',
};

describe('OrderDetailModal', () => {
  beforeEach(() => {
    useOrderDetailsMock.mockReset();
    useOrderDetailsMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      refetch: vi.fn(),
    });
  });

  it('não reserva um rail quando nenhum pedido está selecionado', () => {
    render(<OrderDetailModal {...baseProps} orderId={null} open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Selecione um pedido')).not.toBeInTheDocument();
  });

  it('abre os detalhes como dialog drawer e permite fechar pelo cabeçalho', () => {
    const onOpenChange = vi.fn();
    render(<OrderDetailModal {...baseProps} orderId="order-1" open onOpenChange={onOpenChange} />);

    const drawer = screen.getByRole('dialog', { name: 'Carregando pedido' });
    expect(drawer).toHaveClass('order-details-drawer');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('monta endereço operacional com os campos estruturados quando o snapshot legado falta', () => {
    expect(
      formatDeliveryAddressForOperations({
        address: null,
        zoneName: 'Centro',
        street: 'Rua das Flores',
        number: '182',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01000-000',
      }),
    ).toBe('Rua das Flores, 182 · Centro · São Paulo - SP · 01000-000');
  });
});
