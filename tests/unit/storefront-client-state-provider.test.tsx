import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import {
  StorefrontClientStateProvider,
  useOptionalStorefrontClientState,
} from '@/components/storefront/storefront-client-state-provider';
import { useCartStore } from '@/stores/cart-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

vi.mock('@/components/storefront/consumer-favorites-sync', () => ({
  ConsumerFavoritesSync: () => null,
}));

type ClientStateContext = ReturnType<typeof useOptionalStorefrontClientState>;

function requireContext(context: ClientStateContext) {
  if (!context) throw new Error('Contexto do storefront não inicializado');
  return context;
}

function StateProbe({ onChange }: { onChange?: (context: ClientStateContext) => void }) {
  const context = useOptionalStorefrontClientState();
  useEffect(() => onChange?.(context), [context, onChange]);
  return <span>{context?.hydrated ? `pronto:${context.storeId}` : 'carregando'}</span>;
}

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

describe('estado persistente da moldura do storefront', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    useCartStore.setState({ storeId: null, storeSlug: null, items: [], couponCode: null });
    useFavoritesStore.setState({ storeId: null, productIds: [] });
    usePublicOrderHistoryStore.setState({ storeId: null, storeSlug: null, orders: [] });
  });

  it('hidrata carrinho, favoritos e pedidos uma vez enquanto a moldura permanece montada', async () => {
    const cartSetStore = vi.spyOn(useCartStore.getState(), 'setStore');
    const favoritesSetStore = vi.spyOn(useFavoritesStore.getState(), 'setStore');
    const historySetStore = vi.spyOn(usePublicOrderHistoryStore.getState(), 'setStore');
    const { rerender } = render(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe />
      </StorefrontClientStateProvider>,
    );

    await waitFor(() => expect(screen.getByText('pronto:store-a')).toBeVisible());
    rerender(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe />
      </StorefrontClientStateProvider>,
    );

    expect(cartSetStore).toHaveBeenCalledOnce();
    expect(favoritesSetStore).toHaveBeenCalledOnce();
    expect(historySetStore).toHaveBeenCalledOnce();
  });

  it('isola a memória transitória do catálogo por loja', async () => {
    let currentContext: ClientStateContext = null;
    const captureContext = (context: ClientStateContext) => {
      currentContext = context;
    };
    const { rerender } = render(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(currentContext?.hydrated).toBe(true));

    act(() => {
      requireContext(currentContext).updateCatalogMemory({ search: 'pizza', scrollY: 420 });
    });
    expect(requireContext(currentContext).getCatalogMemory()).toMatchObject({
      search: 'pizza',
      scrollY: 420,
    });

    rerender(
      <StorefrontClientStateProvider storeId="store-b" storeSlug="loja-b">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(screen.getByText('pronto:store-b')).toBeVisible());
    expect(requireContext(currentContext).getCatalogMemory()).toMatchObject({
      search: '',
      scrollY: 0,
    });

    act(() => {
      requireContext(currentContext).updateCatalogMemory({ search: 'sushi', scrollY: 80 });
    });
    rerender(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(screen.getByText('pronto:store-a')).toBeVisible());
    expect(requireContext(currentContext).getCatalogMemory()).toMatchObject({
      search: 'pizza',
      scrollY: 420,
    });
  });
});
