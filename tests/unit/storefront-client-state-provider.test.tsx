import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import {
  STOREFRONT_PRODUCT_DETAIL_CACHE_MAX_ENTRIES,
  StorefrontClientStateProvider,
  useOptionalStorefrontClientState,
} from '@/components/storefront/storefront-client-state-provider';
import { useCartStore } from '@/stores/cart-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';
import type { PublicStorefrontProductDetailDto } from '@/types/storefront';

vi.mock('@/components/storefront/consumer-favorites-sync', () => ({
  ConsumerFavoritesSync: () => null,
}));

type ClientStateContext = ReturnType<typeof useOptionalStorefrontClientState>;

function productDetail(id: string): PublicStorefrontProductDetailDto {
  return {
    id,
    name: `Produto ${id}`,
    description: null,
    imageUrl: null,
    imageAssetId: null,
    basePrice: 2_500,
    isFeatured: false,
    isSoldOut: false,
    allowNotes: true,
    optionGroups: [],
  };
}

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

  it('mantém detalhes de produto por loja somente durante o TTL', async () => {
    let currentContext: ClientStateContext = null;
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const detail = productDetail('product-1');
    const captureContext = (context: ClientStateContext) => {
      currentContext = context;
    };
    const { rerender } = render(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(currentContext?.hydrated).toBe(true));

    act(() => requireContext(currentContext).cacheProductDetail(detail.id, detail));
    expect(requireContext(currentContext).getCachedProductDetail(detail.id)).toBe(detail);

    rerender(
      <StorefrontClientStateProvider storeId="store-b" storeSlug="loja-b">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(screen.getByText('pronto:store-b')).toBeVisible());
    expect(requireContext(currentContext).getCachedProductDetail(detail.id)).toBeNull();

    rerender(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe onChange={captureContext} />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(screen.getByText('pronto:store-a')).toBeVisible());
    expect(requireContext(currentContext).getCachedProductDetail(detail.id)).toBe(detail);

    now += 60_001;
    expect(requireContext(currentContext).getCachedProductDetail(detail.id)).toBeNull();
    const loader = vi.fn().mockResolvedValue(productDetail(detail.id));
    await requireContext(currentContext).requestProductDetail(detail.id, loader);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('deduplica requests em andamento e remove uma Promise rejeitada para permitir retry', async () => {
    let currentContext: ClientStateContext = null;
    let resolveLoader!: (detail: PublicStorefrontProductDetailDto) => void;
    const loader = vi.fn(
      () =>
        new Promise<PublicStorefrontProductDetailDto>((resolve) => {
          resolveLoader = resolve;
        }),
    );
    render(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe
          onChange={(context) => {
            currentContext = context;
          }}
        />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(currentContext?.hydrated).toBe(true));

    const first = requireContext(currentContext).requestProductDetail('product-1', loader);
    const second = requireContext(currentContext).requestProductDetail('product-1', loader);
    expect(first).toBe(second);
    expect(loader).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(loader).toHaveBeenCalledOnce();
    resolveLoader(productDetail('product-1'));
    await expect(first).resolves.toMatchObject({ id: 'product-1' });

    const failingLoader = vi.fn().mockRejectedValue(new Error('temporário'));
    await expect(
      requireContext(currentContext).requestProductDetail('product-2', failingLoader),
    ).rejects.toThrow('temporário');
    const retryLoader = vi.fn().mockResolvedValue(productDetail('product-2'));
    await expect(
      requireContext(currentContext).requestProductDetail('product-2', retryLoader),
    ).resolves.toMatchObject({ id: 'product-2' });
    expect(retryLoader).toHaveBeenCalledOnce();
  });

  it('limita o cache por loja e remove a entrada menos recentemente usada', async () => {
    let currentContext: ClientStateContext = null;
    render(
      <StorefrontClientStateProvider storeId="store-a" storeSlug="loja-a">
        <StateProbe
          onChange={(context) => {
            currentContext = context;
          }}
        />
      </StorefrontClientStateProvider>,
    );
    await waitFor(() => expect(currentContext?.hydrated).toBe(true));

    act(() => {
      for (let index = 0; index < STOREFRONT_PRODUCT_DETAIL_CACHE_MAX_ENTRIES; index += 1) {
        const detail = productDetail(`product-${index}`);
        requireContext(currentContext).cacheProductDetail(detail.id, detail);
      }
    });
    expect(requireContext(currentContext).getCachedProductDetail('product-0')).not.toBeNull();

    act(() => {
      const newest = productDetail('product-new');
      requireContext(currentContext).cacheProductDetail(newest.id, newest);
    });

    expect(requireContext(currentContext).getCachedProductDetail('product-0')).not.toBeNull();
    expect(requireContext(currentContext).getCachedProductDetail('product-1')).toBeNull();
    expect(requireContext(currentContext).getCachedProductDetail('product-new')).not.toBeNull();
  });
});
