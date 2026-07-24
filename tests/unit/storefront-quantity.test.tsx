import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartView } from '@/components/storefront/cart-view';
import { ProductModal } from '@/components/storefront/product-modal';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  clearCart: vi.fn(),
  getTotal: vi.fn(() => 250_000),
  removeItem: vi.fn(),
  removeQuantity: vi.fn(),
  restoreItems: vi.fn(),
  setStore: vi.fn(),
  updateQuantity: vi.fn(),
}));

const cartState = {
  storeId: 'store-1',
  storeSlug: 'loja-1',
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      productName: 'Burger da casa',
      basePrice: 2_500,
      quantity: 99,
      notes: '',
      selectedOptions: [],
      unitPrice: 2_500,
    },
  ],
  ...mocks,
};

vi.mock('@/stores/cart-store', () => ({
  MAX_CART_ITEM_QUANTITY: 99,
  useCartStore: (selector: (state: typeof cartState) => unknown) => selector(cartState),
}));

describe('limite de quantidade no storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('desabilita o incremento e anuncia o limite no modal do produto', () => {
    render(
      <ProductModal
        product={{
          id: 'product-1',
          name: 'Burger da casa',
          description: null,
          imageUrl: null,
          imageAssetId: null,
          basePrice: 2_500,
          isFeatured: false,
          isSoldOut: false,
          allowNotes: false,
          optionGroups: [],
        }}
        onClose={vi.fn()}
        storeOpen
      />,
    );

    const increase = screen.getByRole('button', { name: 'Aumentar quantidade' });
    for (let count = 1; count < 99; count += 1) fireEvent.click(increase);

    expect(document.querySelector('.storefront-product-modal-media')).toBeNull();
    expect(increase).toBeDisabled();
    expect(screen.getByText('Limite de 99 unidades por item atingido.')).toBeVisible();
  });

  it('destaca a imagem, o preço base e atualiza o total do CTA', () => {
    render(
      <ProductModal
        product={{
          id: 'product-1',
          name: 'Burger da casa',
          description: 'Pão, carne e queijo',
          imageUrl: '/imagem-legada.jpg',
          imageAssetId: '4da03571-bffd-45ef-8c44-20686c487838',
          basePrice: 2_500,
          isFeatured: true,
          isSoldOut: false,
          allowNotes: true,
          optionGroups: [],
        }}
        onClose={vi.fn()}
        storeOpen
      />,
    );

    expect(document.querySelector('.storefront-product-modal-media')).not.toBeNull();
    expect(document.querySelector('.storefront-product-modal-media img')).toHaveAttribute(
      'src',
      '/api/store-assets/4da03571-bffd-45ef-8c44-20686c487838?width=768',
    );
    expect(screen.getByText('A partir de')).toBeVisible();
    expect(screen.getByRole('button', { name: /Adicionar/ })).toHaveTextContent('R$ 25,00');

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));

    expect(screen.getByRole('button', { name: /Adicionar/ })).toHaveTextContent('R$ 50,00');
  });

  it('desabilita o incremento e anuncia o limite na sacola', () => {
    render(<CartView storeId="store-1" storeSlug="loja-1" acceptingOrders unavailableReason="" />);

    expect(
      screen.getByRole('button', { name: 'Aumentar quantidade de Burger da casa' }),
    ).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Limite de 99');
    expect(mocks.updateQuantity).not.toHaveBeenCalled();
  });
});
