import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CategoryNav } from '@/components/storefront/category-nav';

const categories = [
  {
    id: 'category-1',
    name: 'Hambúrgueres',
    imageUrl: '/api/store-assets/asset-1?width=96',
    imageAlt: 'Hambúrguer artesanal',
  },
  { id: 'category-2', name: 'Bebidas', imageUrl: null, imageAlt: null },
];

describe('CategoryNav', () => {
  it('mantém exatamente a navegação textual quando imagens estão desativadas', () => {
    const { container } = render(
      <CategoryNav
        categories={categories}
        activeCategoryId="category-1"
        onCategoryClick={vi.fn()}
        variant="HORIZONTAL_STICKY"
        showImages={false}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hambúrgueres' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('mostra somente miniaturas existentes e mantém o clique acessível', () => {
    const onCategoryClick = vi.fn();
    const { container } = render(
      <CategoryNav
        categories={categories}
        activeCategoryId="category-1"
        onCategoryClick={onCategoryClick}
        variant="VERTICAL"
        showImages
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(onCategoryClick).toHaveBeenCalledWith('category-2');
  });

  it('mantém o select nativo somente com texto no modo dropdown', () => {
    const onCategoryClick = vi.fn();
    const { container } = render(
      <CategoryNav
        categories={categories}
        activeCategoryId="category-1"
        onCategoryClick={onCategoryClick}
        variant="DROPDOWN"
        showImages
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    fireEvent.change(screen.getByLabelText('Ir para categoria'), {
      target: { value: 'category-2' },
    });
    expect(onCategoryClick).toHaveBeenCalledWith('category-2');
  });
});
