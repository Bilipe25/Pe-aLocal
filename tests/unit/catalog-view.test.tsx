import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogView } from '@/components/storefront/catalog-view';
import { createDefaultCustomization } from '@/features/customization/domain';

const mocks = vi.hoisted(() => ({ setStore: vi.fn(), fetch: vi.fn() }));

vi.mock('@/stores/cart-store', () => ({
  useCartStore: (selector: (state: { setStore: typeof mocks.setStore }) => unknown) =>
    selector({ setStore: mocks.setStore }),
}));
vi.mock('@/components/storefront/cart-fab', () => ({ CartFab: () => null }));
vi.mock('@/components/storefront/category-nav', () => ({ CategoryNav: () => null }));
vi.mock('@/components/storefront/store-banners', () => ({ StoreBanners: () => null }));
vi.mock('@/components/storefront/product-card', () => ({
  ProductCard: ({ name, onClick }: { name: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
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
    fireEvent.click(
      within(screen.getByRole('status')).getByRole('button', { name: 'Limpar busca' }),
    );

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
});
