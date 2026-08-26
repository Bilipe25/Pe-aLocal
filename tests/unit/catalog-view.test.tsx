import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogView } from '@/components/storefront/catalog-view';
import { createDefaultCustomization } from '@/features/customization/domain';

const mocks = vi.hoisted(() => ({
  setStore: vi.fn(),
  setCouponCode: vi.fn(),
  fetch: vi.fn(),
  cartState: {
    storeId: null as string | null,
    items: [] as Array<{ unitPrice: number; quantity: number }>,
  },
  shellState: null as unknown,
}));

vi.mock('@/stores/cart-store', () => ({
  selectCartStoreId: (state: { storeId: string | null }) => state.storeId,
  selectCartTotal: (state: { items: Array<{ unitPrice: number; quantity: number }> }) =>
    state.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  useCartStore: (
    selector: (state: {
      setStore: typeof mocks.setStore;
      setCouponCode: typeof mocks.setCouponCode;
      storeId: string | null;
      items: Array<{ unitPrice: number; quantity: number }>;
    }) => unknown,
  ) =>
    selector({
      setStore: mocks.setStore,
      setCouponCode: mocks.setCouponCode,
      storeId: mocks.cartState.storeId,
      items: mocks.cartState.items,
    }),
}));
vi.mock('@/components/storefront/cart-fab', () => ({ CartFab: () => null }));
vi.mock('@/components/storefront/storefront-client-state-provider', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/storefront/storefront-client-state-provider')
  >('@/components/storefront/storefront-client-state-provider');
  return {
    ...actual,
    useOptionalStorefrontClientState: () => mocks.shellState,
  };
});
vi.mock('@/components/storefront/category-nav', () => ({ CategoryNav: () => null }));
vi.mock('@/components/storefront/store-banners', () => ({ StoreBanners: () => null }));
vi.mock('@/components/storefront/recent-orders-section', () => ({
  RecentOrdersSection: ({ orders }: { orders: Array<{ id: string; itemsSummary: string }> }) => (
    <section aria-label="Peça de novo">
      {orders.map((order) => (
        <span key={order.id}>{order.itemsSummary}</span>
      ))}
    </section>
  ),
}));
vi.mock('@/components/storefront/product-card', () => ({
  ProductCard: ({
    name,
    onClick,
    onPrefetchIntent,
  }: {
    name: string;
    onClick: () => void;
    onPrefetchIntent?: () => void;
  }) => (
    <button type="button" onClick={onClick} onPointerEnter={onPrefetchIntent}>
      {name}
    </button>
  ),
}));
vi.mock('@/components/storefront/product-modal', () => ({
  ProductModal: ({
    product,
    detail,
    detailStatus,
    detailError,
    onRetry,
    onClose,
    storeOpen,
  }: {
    product: { name: string };
    detail: { allowNotes: boolean } | null;
    detailStatus: string;
    detailError?: string;
    onRetry: () => void;
    onClose: () => void;
    storeOpen: boolean;
  }) => (
    <div
      role="dialog"
      data-store-open={String(storeOpen)}
      data-detail-status={detailStatus}
      data-allow-notes={String(detail?.allowNotes ?? false)}
    >
      {product.name}
      {detailError && <p>{detailError}</p>}
      {detailStatus === 'error' && (
        <button type="button" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
      <button type="button" onClick={onClose}>
        Fechar
      </button>
    </div>
  ),
}));

const categories = [
  {
    id: 'category-1',
    name: 'Lanches',
    description: null,
    image: null,
    products: [
      {
        id: 'product-1',
        name: 'Burger da casa',
        description: 'Pão, carne e queijo',
        imageUrl: null,
        imageAssetId: null,
        basePrice: 2500,
        isFeatured: false,
        isSoldOut: false,
      },
    ],
  },
];

const productDetail = {
  ...categories[0].products[0],
  allowNotes: true,
  optionGroups: [],
};

const commercialCategories = [
  {
    id: 'category-1',
    name: 'Lanches',
    description: null,
    image: null,
    products: [
      {
        ...categories[0].products[0],
        id: '00000000-0000-0000-0002-000000000001',
        name: 'X-Bacon recorrente',
        isFeatured: true,
      },
      {
        ...categories[0].products[0],
        id: '00000000-0000-0000-0002-000000000002',
        name: 'Batata destaque',
        isFeatured: true,
      },
    ],
  },
];

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('catálogo público', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cartState.storeId = null;
    mocks.cartState.items = [];
    mocks.shellState = null;
    mocks.fetch.mockResolvedValue(response({ product: productDetail }));
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  it('permite consultar o produto mesmo quando a loja está fechada', async () => {
    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen={false}
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-store-open', 'false');
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
  });

  it('carrega o detalhe somente ao abrir e reutiliza o cache por produto', async () => {
    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));

    expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'loading');
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-allow-notes', 'true');
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/storefront/loja-1/products/product-1',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('prefetch por intenção não abre o modal e o toque reutiliza a request em andamento', async () => {
    let resolveRequest!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    const product = screen.getByRole('button', { name: 'Burger da casa' });
    fireEvent.pointerEnter(product);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(product);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'loading');
    expect(mocks.fetch).toHaveBeenCalledOnce();

    resolveRequest(response({ product: productDetail }));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('reutiliza o detalhe após o catálogo desmontar enquanto a moldura permanece ativa', async () => {
    const productCache = new Map<string, typeof productDetail>();
    const getCachedProductDetail = vi.fn(
      (productId: string) => productCache.get(productId) ?? null,
    );
    const cacheProductDetail = vi.fn((productId: string, detail: typeof productDetail) => {
      productCache.set(productId, detail);
    });
    const updateCatalogMemory = vi.fn();
    mocks.shellState = {
      storeId: 'store-1',
      storeSlug: 'loja-1',
      hydrated: true,
      getCatalogMemory: () => ({
        search: '',
        sort: 'RELEVANCE',
        onlyAvailable: false,
        activeCategoryId: null,
        scrollY: 0,
      }),
      updateCatalogMemory,
      getCachedProductDetail,
      cacheProductDetail,
    };

    const firstVisit = render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    firstVisit.unmount();

    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));

    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    expect(cacheProductDetail).toHaveBeenCalledOnce();
    expect(getCachedProductDetail).toHaveBeenLastCalledWith('product-1');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('persiste a posição exata da janela ao desmontar antes do debounce', () => {
    const updateCatalogMemory = vi.fn();
    mocks.shellState = {
      storeId: 'store-1',
      storeSlug: 'loja-1',
      hydrated: true,
      getCatalogMemory: () => ({
        search: '',
        sort: 'RELEVANCE',
        onlyAvailable: false,
        activeCategoryId: null,
        scrollY: 0,
      }),
      updateCatalogMemory,
      getCachedProductDetail: vi.fn(() => null),
      cacheProductDetail: vi.fn(),
    };
    const view = render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 777 });
    fireEvent.scroll(window);

    view.unmount();

    expect(updateCatalogMemory).toHaveBeenCalledWith({ scrollY: 777 });
  });

  it('mostra erro recuperável e tenta carregar o detalhe novamente', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ message: 'Falha temporária.' }, 500))
      .mockResolvedValueOnce(response({ product: productDetail }));

    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Burger da casa' }));
    await waitFor(() => expect(screen.getByText('Falha temporária.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-detail-status', 'success'),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('explica a busca vazia, permite limpar e devolve o foco', async () => {
    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    const search = screen.getByRole('searchbox', { name: 'Buscar no cardápio' });
    fireEvent.change(search, { target: { value: 'pizza' } });

    expect(search).toHaveValue('pizza');
    await waitFor(() =>
      expect(screen.getByText('Nenhum resultado para “pizza”')).toBeInTheDocument(),
    );
    fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'Limpar busca' }));

    expect(search).toHaveValue('');
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('anuncia a quantidade de resultados de uma busca', async () => {
    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no cardápio' }), {
      target: { value: 'burger' },
    });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 produto encontrado'),
    );
  });

  it('mostra contador visual de resultados e contagem de filtros ativos', async () => {
    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no cardápio' }), {
      target: { value: 'burger' },
    });

    await waitFor(() => expect(screen.getByText('1 produto encontrado')).toBeVisible());

    // Filtro "somente disponíveis" adiciona contagem extra no resumo.
    const filterButton = screen.getByRole('button', { name: 'Abrir filtros' });
    fireEvent.click(filterButton);
    const onlyAvailableLabel = screen.getByText('Somente disponíveis');
    fireEvent.click(onlyAvailableLabel);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/1 produto encontrado.*1 filtro/),
    );
  });

  it('oculta apenas a vitrine Destaques e mantém seus produtos nas categorias', () => {
    render(
      <CatalogView
        categories={commercialCategories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
        showFeaturedProductsSection={false}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Destaques' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'X-Bacon recorrente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Batata destaque' })).toBeInTheDocument();
  });

  it('mostra banner de pedido mínimo quando a sacola está abaixo do valor mínimo', () => {
    mocks.cartState.storeId = 'store-1';
    mocks.cartState.items = [{ unitPrice: 1200, quantity: 1 }];

    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
        minOrderValue={2500}
      />,
    );

    const banner = screen.getByText(/Faltam.*para o pedido mínimo/);
    expect(banner).toHaveTextContent('Faltam R$ 13,00 para o pedido mínimo de R$ 25,00.');
    expect(banner.parentElement).toHaveTextContent('Ver sacola');
    expect(banner.parentElement?.querySelector('a')).toHaveAttribute('href', '/loja-1/cart');
  });

  it('não mostra banner de pedido mínimo quando não há sacola ou o valor já foi atingido', () => {
    mocks.cartState.storeId = 'store-1';
    mocks.cartState.items = [{ unitPrice: 2500, quantity: 1 }];

    render(
      <CatalogView
        categories={categories}
        storeId="store-1"
        storeSlug="loja-1"
        storeOpen
        customization={createDefaultCustomization()}
        banners={[]}
        minOrderValue={2500}
      />,
    );

    expect(screen.queryByText(/Faltam.*para o pedido mínimo/)).not.toBeInTheDocument();
  });
});
