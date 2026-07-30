import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCartCheckoutHref, CartView } from '@/components/storefront/cart-view';
import { ProductModal } from '@/components/storefront/product-modal';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  clearCart: vi.fn(),
  getTotal: vi.fn(() => 250_000),
  removeItem: vi.fn(),
  removeQuantity: vi.fn(),
  restoreSnapshot: vi.fn(),
  restoreItems: vi.fn(),
  setCouponCode: vi.fn(),
  setStore: vi.fn(),
  storageCleanup: vi.fn(),
  subscribeToCartStorage: vi.fn(),
  updateItem: vi.fn(),
  updateQuantity: vi.fn(),
  getSnapshot: vi.fn(() => ({ items: [], couponCode: null, revision: 0 })),
}));

const cartState = {
  storeId: 'store-1',
  storeSlug: 'loja-1',
  couponCode: null,
  revision: 0,
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

const productSummary = {
  id: 'product-1',
  name: 'Burger da casa',
  description: null,
  imageUrl: null,
  imageAssetId: null,
  basePrice: 2_500,
  isFeatured: false,
  isSoldOut: false,
};

const productDetail = {
  ...productSummary,
  allowNotes: false,
  optionGroups: [],
};

vi.mock('@/stores/cart-store', () => ({
  MAX_CART_ITEM_QUANTITY: 99,
  selectCartCouponCode: (state: typeof cartState) => state.couponCode,
  selectCartRevision: (state: typeof cartState) => state.revision,
  subscribeToCartStorage: mocks.subscribeToCartStorage,
  useCartStore: (selector: (state: typeof cartState) => unknown) => selector(cartState),
}));
vi.mock('@/components/storefront/cart-recommendations', () => ({
  CartRecommendations: () => null,
}));

describe('limite de quantidade no storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateItem.mockReturnValue({
      status: 'updated',
      itemId: 'item-1',
      merged: false,
    });
    mocks.subscribeToCartStorage.mockReturnValue(mocks.storageCleanup);
  });

  it('mantém o checkout sem modalidade na URL', () => {
    expect(buildCartCheckoutHref('loja-1')).toBe('/loja-1/checkout');
  });

  it('desabilita o incremento e anuncia o limite no modal do produto', () => {
    render(
      <ProductModal
        product={productSummary}
        detail={productDetail}
        detailStatus="success"
        onRetry={vi.fn()}
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
          ...productSummary,
          description: 'Pão, carne e queijo',
          imageUrl: '/imagem-legada.jpg',
          imageAssetId: '4da03571-bffd-45ef-8c44-20686c487838',
          isFeatured: true,
        }}
        detail={{
          ...productDetail,
          description: 'Pão, carne e queijo',
          imageUrl: '/imagem-legada.jpg',
          imageAssetId: '4da03571-bffd-45ef-8c44-20686c487838',
          isFeatured: true,
          allowNotes: true,
        }}
        detailStatus="success"
        onRetry={vi.fn()}
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

  it('bloqueia o CTA durante o carregamento do detalhe', () => {
    render(
      <ProductModal
        product={productSummary}
        detail={null}
        detailStatus="loading"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        storeOpen
      />,
    );

    expect(screen.getByText('Carregando adicionais e opções do produto.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregando...' })).toBeDisabled();
  });

  it('permite tentar novamente quando o detalhe falha', () => {
    const onRetry = vi.fn();
    render(
      <ProductModal
        product={productSummary}
        detail={null}
        detailStatus="error"
        detailError="Falha ao consultar o produto."
        onRetry={onRetry}
        onClose={vi.fn()}
        storeOpen
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao consultar o produto.');
    expect(screen.getByRole('button', { name: 'Detalhes indisponíveis' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('edita o item preservando quantidade, observação e adicionais atuais', async () => {
    const option = { id: 'option-a', name: 'Queijo extra', price: 300 };
    render(
      <ProductModal
        product={productSummary}
        detail={{
          ...productDetail,
          allowNotes: true,
          optionGroups: [
            {
              id: 'group-a',
              title: 'Adicionais',
              description: null,
              isRequired: false,
              isMultiple: true,
              minSelections: 0,
              maxSelections: 2,
              options: [option],
            },
          ],
        }}
        detailStatus="success"
        onRetry={vi.fn()}
        onClose={vi.fn()}
        storeOpen
        cartItem={{
          ...cartState.items[0],
          quantity: 2,
          notes: 'sem cebola',
          selectedOptions: [option],
          unitPrice: 2_800,
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Queijo extra/ })).toBeChecked(),
    );
    expect(screen.getByLabelText('Alguma observação?')).toHaveValue('sem cebola');
    expect(screen.getByRole('button', { name: /Salvar alterações/ })).toHaveTextContent('R$ 56,00');

    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/ }));

    expect(mocks.updateItem).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        quantity: 2,
        notes: 'sem cebola',
        selectedOptions: [option],
        unitPrice: 2_800,
      }),
    );
  });

  it('desabilita o incremento e anuncia o limite na sacola', () => {
    const { unmount } = render(
      <CartView storeId="store-1" storeSlug="loja-1" acceptingOrders unavailableReason="" />,
    );

    expect(
      screen.getByRole('button', { name: 'Aumentar quantidade de Burger da casa' }),
    ).toBeDisabled();
    expect(screen.getByText('Limite de 99 unidades.')).toBeVisible();
    expect(screen.queryByText('Como você quer receber?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Código do cupom')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Tem um cupom\?/ }));
    expect(screen.getByLabelText('Código do cupom')).toBeVisible();
    expect(
      screen.getByText('Recebimento e eventual taxa de entrega são definidos no checkout.'),
    ).toBeVisible();
    expect(mocks.updateQuantity).not.toHaveBeenCalled();
    expect(mocks.subscribeToCartStorage).toHaveBeenCalledWith('store-1', 'loja-1');

    unmount();
    expect(mocks.storageCleanup).toHaveBeenCalledOnce();
  });
});
