import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDeliveryAddressForOperations,
  OrderDetailModal,
} from '@/components/dashboard/order-detail-modal';
import type { OrderDetailsDTO } from '@/types/order-query';

const useOrderDetailsMock = vi.fn();
const useOrderHistoryMock = vi.fn();

vi.mock('@/hooks/use-orders', () => ({
  useOrderDetails: (...args: unknown[]) => useOrderDetailsMock(...args),
  useOrderHistory: (...args: unknown[]) => useOrderHistoryMock(...args),
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

const details = {
  id: 'order-1',
  orderNumber: 1042,
  customer: { name: 'Mariana Souza', phone: null },
  modality: 'PICKUP',
  delivery: {
    address: null,
    zoneName: null,
    street: null,
    number: null,
    neighborhood: null,
    city: null,
    state: null,
    postalCode: null,
  },
  items: [],
  totals: { subtotal: 6_890, discount: 0, deliveryFee: 0, total: 6_890 },
  payment: {
    method: 'PIX',
    status: 'PENDING',
    changeFor: null,
    amount: null,
    paidAt: null,
    reportedAt: null,
    failedAt: null,
    failureReasonCode: null,
    cancelledAt: null,
    refundedAt: null,
    refundReasonCode: null,
    refundAmount: null,
  },
  status: 'PREPARING',
  promisedFulfillmentMinAt: '2026-07-31T12:30:00.000Z',
  promisedFulfillmentMaxAt: '2026-07-31T12:45:00.000Z',
  acceptedAt: '2026-07-31T12:02:00.000Z',
  preparingAt: '2026-07-31T12:05:00.000Z',
  readyAt: null,
  dispatchedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  customerNotes: null,
  cancellation: { reasonCode: null, note: null, cancelledAt: null },
  recentHistory: [
    {
      id: 'history-1',
      fromStatus: 'PENDING',
      toStatus: 'CONFIRMED',
      actorName: 'Rafael Lima',
      source: 'DASHBOARD',
      reasonCode: null,
      note: null,
      isUndo: false,
      versionFrom: 2,
      versionTo: 3,
      createdAt: '2026-07-31T12:02:00.000Z',
    },
  ],
  recentPaymentHistory: [],
  version: 3,
  createdAt: '2026-07-31T12:00:00.000Z',
  statusChangedAt: '2026-07-31T12:05:00.000Z',
  lastChangedBy: 'Rafael Lima',
  operational: {
    stageLabel: 'Em preparo',
    stageStartedAt: '2026-07-31T12:05:00.000Z',
    elapsedMinutes: 58,
    alerts: [],
    durations: {
      acceptanceMinutes: 2,
      preparationMinutes: 58,
      readyMinutes: null,
      deliveryMinutes: null,
      totalMinutes: 63,
    },
  },
  operationalSla: {
    enabled: false,
    enabledAt: null,
    warningMinutes: 2,
    criticalMinutes: 4,
  },
  allowedActions: {
    accept: false,
    startPreparation: false,
    markReady: true,
    dispatch: false,
    complete: false,
    cancel: true,
    confirmPayment: true,
    markPaymentFailed: true,
    retryPayment: false,
    refundPayment: false,
    undo: false,
    viewCustomerContact: false,
    viewPaymentDetails: true,
    viewHistory: true,
    addInternalNote: true,
  },
} satisfies OrderDetailsDTO;

describe('OrderDetailModal', () => {
  beforeEach(() => {
    useOrderDetailsMock.mockReset();
    useOrderDetailsMock.mockReturnValue({
      data: undefined,
      error: null,
      isLoading: true,
      refetch: vi.fn(),
    });
    useOrderHistoryMock.mockReset();
    useOrderHistoryMock.mockReturnValue({
      data: undefined,
      error: null,
      hasNextPage: false,
      isFetching: false,
      fetchNextPage: vi.fn(),
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

  it('retira a versão do cabeçalho, mas a preserva no histórico', () => {
    useOrderDetailsMock.mockReturnValue({
      data: details,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<OrderDetailModal {...baseProps} orderId="order-1" open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Versão 3')).not.toBeInTheDocument();
    expect(screen.queryByText(/versão 3/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Histórico do pedido' }));
    expect(screen.getByText(/versão 3/)).toBeInTheDocument();
    expect(screen.getByText('Previsão vencida há 18 min')).toBeInTheDocument();
  });

  it('prioriza produtos, telefone e endereço antes dos detalhes operacionais', () => {
    useOrderDetailsMock.mockReturnValue({
      data: {
        ...details,
        customer: { name: 'Mariana Souza', phone: '(11) 99999-9999' },
        modality: 'DELIVERY',
        delivery: {
          address: 'Rua das Flores, 182 · Centro · São Paulo - SP',
          zoneName: 'Centro',
          street: 'Rua das Flores',
          number: '182',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          postalCode: '01000-000',
        },
        customerNotes: 'Sem cebola, por favor.',
        items: [
          {
            id: 'item-1',
            productName: 'X-Burguer Clássico',
            unitPrice: 3_290,
            quantity: 2,
            notes: 'Cortar ao meio',
            itemTotal: 6_580,
            options: [
              {
                id: 'option-1',
                name: 'Bacon extra',
                price: 300,
                groupName: 'Adicionais',
              },
            ],
          },
        ],
      } satisfies OrderDetailsDTO,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<OrderDetailModal {...baseProps} orderId="order-1" open onOpenChange={vi.fn()} />);

    const productsHeading = screen.getByRole('heading', { name: 'Produtos (1)' });
    const customerHeading = screen.getByRole('heading', { name: 'Cliente e entrega' });
    const operationHeading = screen.getByRole('heading', { name: 'Operação' });

    expect(
      productsHeading.compareDocumentPosition(customerHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      customerHeading.compareDocumentPosition(operationHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('2× X-Burguer Clássico')).toBeInTheDocument();
    expect(screen.getByText('(11) 99999-9999')).toBeInTheDocument();
    expect(screen.getByText(/Rua das Flores, 182/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ligar para Mariana Souza' })).toHaveAttribute(
      'href',
      'tel:+5511999999999',
    );
    expect(screen.getByLabelText('Linha do tempo do pedido')).not.toBeVisible();

    fireEvent.click(screen.getByText('Linha do tempo e métricas'));
    expect(screen.getByLabelText('Linha do tempo do pedido')).toBeInTheDocument();
  });
});
