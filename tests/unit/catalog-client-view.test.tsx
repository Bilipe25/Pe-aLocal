import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogClientView } from '@/features/catalog/components/catalog-client-view';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  moveCategoryAction: vi.fn(),
  moveProductAction: vi.fn(),
  setProductAvailabilityAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/catalog/actions', () => ({
  moveCategoryAction: mocks.moveCategoryAction,
  moveProductAction: mocks.moveProductAction,
  moveOptionAction: vi.fn(),
  moveOptionGroupAction: vi.fn(),
  setProductAvailabilityAction: mocks.setProductAvailabilityAction,
}));

const categories = [
  { id: 'category-1', name: 'Hambúrgueres', isActive: true, _count: { products: 2 } },
  { id: 'category-2', name: 'Bebidas', isActive: true, _count: { products: 1 } },
];

const products = [
  {
    id: 'product-1',
    name: 'X-Burguer Clássico',
    imageUrl: null,
    imageAssetId: 'asset-product-1',
    basePrice: 2_490,
    isAvailable: true,
    isFeatured: true,
    isSoldOut: false,
    allowNotes: true,
    sortOrder: 1_000,
    _count: { optionGroups: 1 },
    category: { id: 'category-1', name: 'Hambúrgueres' },
  },
  {
    id: 'product-2',
    name: 'X-Salada',
    imageUrl: 'https://cdn.example.com/x-salada.webp',
    imageAssetId: null,
    basePrice: 2_690,
    isAvailable: true,
    isFeatured: false,
    isSoldOut: false,
    allowNotes: true,
    sortOrder: 2_000,
    _count: { optionGroups: 0 },
    category: { id: 'category-1', name: 'Hambúrgueres' },
  },
  {
    id: 'product-3',
    name: 'Suco Natural',
    imageUrl: null,
    imageAssetId: null,
    basePrice: 900,
    isAvailable: true,
    isFeatured: false,
    isSoldOut: true,
    allowNotes: false,
    sortOrder: 1_000,
    _count: { optionGroups: 0 },
    category: { id: 'category-2', name: 'Bebidas' },
  },
];

function renderCatalog() {
  return render(
    <CatalogClientView
      categories={categories}
      products={products}
      readinessIssues={[
        {
          type: 'product_no_required_group_options',
          entityId: 'product-1',
          entityName: 'X-Burguer Clássico',
          message: 'Produto possui um grupo obrigatório sem opções disponíveis.',
        },
      ]}
      canManageCatalog
      canReorderCatalog
      canManageAvailability
    />,
  );
}

describe('CatalogClientView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('mantém ordenação fora da interface até o operador ativar o modo', () => {
    renderCatalog();

    expect(
      screen.queryByRole('button', { name: 'Mover categoria Hambúrgueres para baixo' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    expect(screen.getByRole('button', { name: 'Organizar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Mover categoria Hambúrgueres para baixo' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mover produto X-Burguer Clássico para baixo' }),
    ).toBeInTheDocument();
  });

  it('usa ações explícitas e acessíveis para disponibilidade e edição', () => {
    renderCatalog();

    expect(
      screen.getByRole('button', { name: 'Marcar X-Burguer Clássico como esgotado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar produto X-Burguer Clássico' })).toHaveAttribute(
      'href',
      '/dashboard/catalog/products/product-1/edit',
    );
    expect(screen.getByRole('link', { name: 'Editar categoria Hambúrgueres' })).toHaveAttribute(
      'href',
      '/dashboard/catalog/categories/category-1/edit',
    );
  });

  it('exibe miniaturas redimensionadas e fallback para produtos sem imagem', () => {
    const { container } = renderCatalog();

    expect(
      container.querySelector('img[src="/api/tenant/assets/asset-product-1?width=128"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src="https://cdn.example.com/x-salada.webp"]'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Suco Natural está sem imagem')).toBeInTheDocument();
  });

  it('filtra sem acentos e remove o modo de organização durante a busca', async () => {
    vi.useFakeTimers();
    renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no catálogo' }), {
      target: { value: 'suco' },
    });
    await act(async () => vi.advanceTimersByTime(250));

    expect(screen.getByRole('heading', { name: 'Bebidas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hambúrgueres' })).not.toBeInTheDocument();
    expect(screen.getByText('Suco Natural')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organizar' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Mover produto Suco Natural para cima' }),
    ).not.toBeInTheDocument();
  });

  it('apresenta pendências em um disclosure compacto e acionável', () => {
    renderCatalog();

    expect(screen.getByText('1 ajuste necessário')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Produto possui um grupo obrigatório sem opções disponíveis.',
      }),
    ).toHaveAttribute('href', '/dashboard/catalog/products/product-1/edit');
  });
});
