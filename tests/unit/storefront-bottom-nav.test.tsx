import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { useCartStore } from '@/stores/cart-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/loja-a',
  push: vi.fn(),
}));
const linkStatusMocks = vi.hoisted(() => ({ pendingHref: null as string | null }));

vi.mock('next/link', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const LinkHrefContext = React.createContext('');
  const Link = React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >(function MockLink({ children, href, ...props }, ref) {
    return (
      <LinkHrefContext.Provider value={href}>
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      </LinkHrefContext.Provider>
    );
  });
  return {
    default: Link,
    useLinkStatus: () => ({
      pending: React.useContext(LinkHrefContext) === linkStatusMocks.pendingHref,
    }),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
}));

describe('navegação inferior do storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.pathname = '/loja-a';
    linkStatusMocks.pendingHref = null;
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

  it('mantém quatro destinos, estado ativo e badge da loja atual', () => {
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    const navigation = screen.getByRole('navigation', { name: 'Navegação da loja' });
    expect(navigation.querySelectorAll('a')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Carrinho, 2 itens' })).toHaveAttribute(
      'href',
      '/loja-a/cart',
    );
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('href', '/loja-a/orders');
    expect(screen.getByRole('link', { name: 'Mais' })).toHaveAttribute('href', '/loja-a/mais');
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
    'mantém Pedidos ativo na rota %s',
    (pathname) => {
      navigationMocks.pathname = pathname;
      render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

      expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page');
    },
  );

  it.each([
    '/loja-a/mais',
    '/loja-a/mais/beneficios',
    '/loja-a/favorites',
    '/loja-a/account',
    '/loja-a/account/addresses',
  ])('mantém Mais ativo na rota %s e não ativa Pedidos', (pathname) => {
    navigationMocks.pathname = pathname;
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    expect(screen.getByRole('link', { name: 'Mais' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Pedidos' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('preserva o indicador de pedidos lembrados', () => {
    usePublicOrderHistoryStore.setState({
      storeId: 'store-a',
      storeSlug: 'loja-a',
      orders: [
        {
          trackingToken: '00000000-0000-4000-8000-000000000000',
          storeId: 'store-a',
          storeSlug: 'loja-a',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    expect(screen.getByRole('link', { name: 'Pedidos' })).toContainElement(
      document.querySelector('.storefront-bottom-nav-indicator'),
    );
  });

  it('mostra feedback imediato sem antecipar aria-current durante uma navegação pendente', () => {
    navigationMocks.pathname = '/loja-a/orders';
    linkStatusMocks.pendingHref = '/loja-a/cart';

    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    expect(document.querySelectorAll('.storefront-bottom-nav-item.is-pending')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Carrinho, 2 itens' })).toContainElement(
      document.querySelector('.storefront-bottom-nav-item.is-pending'),
    );
    expect(screen.getByRole('link', { name: 'Pedidos' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Mais' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Abrindo Carrinho')).toBeInTheDocument();
    expect(screen.queryByText('Abrindo Cardápio')).not.toBeInTheDocument();
    expect(screen.queryByText('Abrindo Pedidos')).not.toBeInTheDocument();
    expect(screen.queryByText('Abrindo Mais')).not.toBeInTheDocument();
  });
});
