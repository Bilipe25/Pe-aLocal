import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogView } from '@/components/storefront/catalog-view';
import { createDefaultCustomization } from '@/features/customization/domain';

const mocks = vi.hoisted(() => ({ setStore: vi.fn() }));

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
    storeOpen,
  }: {
    product: { name: string };
    storeOpen: boolean;
  }) => (
    <div role="dialog" data-store-open={String(storeOpen)}>
      {product.name}
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
        basePrice: 2500,
        isFeatured: false,
        isSoldOut: false,
        allowNotes: true,
        optionGroups: [],
      },
    ],
  },
];

describe('catálogo público', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  it('permite consultar o produto mesmo quando a loja está fechada', () => {
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

    expect(screen.getByText('Nenhum resultado para “pizza”')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(search).toHaveValue('');
    await waitFor(() => expect(search).toHaveFocus());
  });
});
