import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderDetailsSheet } from '@/components/storefront/order-details-sheet';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const mockDetails = {
  orderNumber: 23,
  publicToken: 'token-23',
  status: 'DELIVERED',
  statusLabel: 'Entregue',
  statusChangedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  modality: 'DELIVERY',
  paymentMethod: 'Pix',
  paymentStatus: 'PAID',
  subtotal: 3500,
  deliveryFee: 500,
  discount: 0,
  total: 4000,
  deliveryAddress: 'Rua das Flores, 123 - Fortaleza',
  events: [
    {
      status: 'PENDING',
      label: 'Pedido recebido',
      timestamp: new Date().toISOString(),
      completed: true,
      current: false,
    },
    {
      status: 'DELIVERED',
      label: 'Entregue',
      timestamp: new Date().toISOString(),
      completed: true,
      current: true,
    },
  ],
  items: [
    {
      id: 'item-1',
      productId: 'prod-1',
      productName: 'X-Salada Artesanal',
      unitPrice: 2500,
      quantity: 1,
      notes: 'Sem cebola',
      itemTotal: 2500,
      imageUrl: null,
      imageAssetId: null,
      options: [{ optionName: 'Bacon extra', optionPrice: 500 }],
    },
  ],
};

describe('OrderDetailsSheet', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('exibe os detalhes do pedido, itens com foto/opções e resumo financeiro', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(mockDetails), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(
      <OrderDetailsSheet
        open={true}
        onOpenChange={() => {}}
        trackingToken="token-23"
        storeId="store-1"
        storeSlug="loja-test"
      />,
    );

    expect(screen.getByText('Carregando detalhes...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Pedido #23' })).toBeInTheDocument();
    });

    expect(screen.getByText('X-Salada Artesanal', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Bacon extra')).toBeInTheDocument();
    expect(screen.getByText('Obs: Sem cebola')).toBeInTheDocument();
    expect(screen.getByText('Rua das Flores, 123 - Fortaleza')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pedir novamente/i })).toBeInTheDocument();
  });
});
