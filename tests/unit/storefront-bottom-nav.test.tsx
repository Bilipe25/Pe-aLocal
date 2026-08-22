import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { useCartStore } from '@/stores/cart-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/loja-a',
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
}));

describe('navegação inferior do storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.pathname = '/loja-a';
    useCartStore.setState({
      storeId: 'store-a',
      storeSlug: 'loja-a',
      items: [
        {
          id: 'line-a',
          productId: 'product-a',
          productName: 'Produto A',
          basePrice: 1_000,
          quantity: 2,
          notes: '',
          selectedOptions: [],
          unitPrice: 1_000,
        },
      ],
    });
    usePublicOrderHistoryStore.setState({
      storeId: null,
      storeSlug: null,
      orders: [],
    });
  });

  it('mantém três destinos por padrão, estado ativo e badge da loja atual', () => {
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    const navigation = screen.getByRole('navigation', { name: 'Navegação da loja' });
    expect(navigation.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Carrinho, 2 itens' })).toHaveAttribute(
      'href',
      '/loja-a/cart',
    );
    expect(screen.getByRole('link', { name: 'Meu pedido' })).toHaveAttribute(
      'href',
      '/loja-a/orders',
    );
    expect(screen.queryByRole('link', { name: 'Favoritos' })).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeVisible();
  });

  it.each(['/loja-a/cart', '/loja-a/checkout'])('mantém Carrinho ativo na rota %s', (pathname) => {
    navigationMocks.pathname = pathname;
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    expect(screen.getByRole('link', { name: 'Carrinho, 2 itens' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each(['/loja-a/orders', '/loja-a/order/123'])(
    'mantém Meu pedido ativo na rota %s',
    (pathname) => {
      navigationMocks.pathname = pathname;
      render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

      expect(screen.getByRole('link', { name: 'Meu pedido' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    },
  );
});
