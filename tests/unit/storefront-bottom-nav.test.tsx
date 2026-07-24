import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontBottomNav } from '@/components/storefront/storefront-bottom-nav';
import { useCartStore } from '@/stores/cart-store';
import {
  getLastOrderStorageKey,
  useLastOrderStore,
  writeLastOrder,
} from '@/stores/last-order-store';

const TRACKING_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const navigationMocks = vi.hoisted(() => ({
  pathname: '/loja-a',
  push: vi.fn(),
}));

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
}));

describe('navegação inferior do storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
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
    useLastOrderStore.setState({
      storeId: null,
      storeSlug: null,
      record: null,
    });
  });

  it('mantém exatamente três destinos, estado ativo e badge da loja atual', () => {
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    const navigation = screen.getByRole('navigation', { name: 'Navegação da loja' });
    expect(navigation.querySelectorAll('a, button')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Cardápio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Carrinho, 2 itens' })).toHaveAttribute(
      'href',
      '/loja-a/cart',
    );
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

  it('exibe estado vazio sem fazer requisição quando não há pedido salvo', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    fireEvent.click(screen.getByRole('button', { name: 'Meu pedido' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Você ainda não tem um pedido recente nesta loja.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('valida o token público antes de abrir o último pedido', async () => {
    writeLastOrder(window.localStorage, {
      trackingToken: TRACKING_TOKEN,
      storeId: 'store-a',
      storeSlug: 'loja-a',
      createdAt: '2026-07-24T12:00:00.000Z',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    await waitFor(() => expect(useLastOrderStore.getState().record).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Meu pedido' }));

    await waitFor(() =>
      expect(navigationMocks.push).toHaveBeenCalledWith(`/loja-a/order/${TRACKING_TOKEN}`),
    );
  });

  it('remove token inválido e apresenta o estado vazio', async () => {
    writeLastOrder(window.localStorage, {
      trackingToken: TRACKING_TOKEN,
      storeId: 'store-a',
      storeSlug: 'loja-a',
      createdAt: '2026-07-24T12:00:00.000Z',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    render(<StorefrontBottomNav storeId="store-a" storeSlug="loja-a" />);

    await waitFor(() => expect(useLastOrderStore.getState().record).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Meu pedido' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'O pedido salvo não está mais disponível.',
    );
    expect(window.localStorage.getItem(getLastOrderStorageKey('store-a'))).toBeNull();
  });
});
