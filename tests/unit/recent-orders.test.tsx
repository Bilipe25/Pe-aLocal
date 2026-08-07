import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentOrdersSection } from '@/components/storefront/recent-orders-section';
import { useCartStore } from '@/stores/cart-store';
import type { PublicRecentOrderDto } from '@/types/storefront';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockOrders: PublicRecentOrderDto[] = [
  {
    id: 'order-1',
    orderNumber: 23,
    lastPurchasedAt: new Date().toISOString(),
    timeAgoLabel: 'Comprado há 2 dias',
    totalItemCount: 3,
    totalCents: 4500,
    itemsSummary: 'X-Salada, Batata Grande, Coca-Cola 350ml',
    extraItemsCount: 0,
    thumbnails: [
      { imageUrl: null, imageAssetId: null, productName: 'X-Salada' },
      { imageUrl: null, imageAssetId: null, productName: 'Batata Grande' },
      { imageUrl: null, imageAssetId: null, productName: 'Coca-Cola 350ml' },
    ],
    extraThumbnailsCount: 0,
    items: [
      {
        productId: 'prod-1',
        productName: 'X-Salada',
        quantity: 1,
        unitPrice: 2500,
        notes: '',
        imageUrl: null,
        imageAssetId: null,
        options: [{ name: 'Bacon extra', price: 500 }],
      },
      {
        productId: 'prod-2',
        productName: 'Batata Grande',
        quantity: 1,
        unitPrice: 1200,
        notes: '',
        imageUrl: null,
        imageAssetId: null,
        options: [],
      },
      {
        productId: 'prod-3',
        productName: 'Coca-Cola 350ml',
        quantity: 1,
        unitPrice: 800,
        notes: '',
        imageUrl: null,
        imageAssetId: null,
        options: [],
      },
    ],
  },
];

describe('RecentOrdersSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useCartStore.setState({
      storeId: null,
      storeSlug: null,
      items: [],
    });
  });

  it('não renderiza nada se a lista de pedidos estiver vazia', () => {
    const { container } = render(
      <RecentOrdersSection storeId="store-1" storeSlug="loja-test" orders={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza os cards de pedidos anteriores completos', () => {
    render(
      <RecentOrdersSection storeId="store-1" storeSlug="loja-test" orders={mockOrders} />,
    );

    expect(screen.getByText('Peça de novo')).toBeInTheDocument();
    expect(screen.getByText('X-Salada, Batata Grande, Coca-Cola 350ml')).toBeInTheDocument();
    expect(screen.getByText('3 itens · Comprado há 2 dias')).toBeInTheDocument();
    expect(screen.getByText('R$ 45,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pedir/i })).toBeInTheDocument();
  });

  it('adiciona todos os itens do pedido anterior à sacola ao clicar em Pedir novamente', () => {
    render(
      <RecentOrdersSection storeId="store-1" storeSlug="loja-test" orders={mockOrders} />,
    );

    const button = screen.getByRole('button', { name: /Pedir/i });
    fireEvent.click(button);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(3);
    expect(items[0].productName).toBe('X-Salada');
    expect(items[1].productName).toBe('Batata Grande');
    expect(items[2].productName).toBe('Coca-Cola 350ml');
  });
});
