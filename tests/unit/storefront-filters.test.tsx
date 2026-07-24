import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import StorefrontLoading from '@/app/[storeSlug]/loading';
import { StorefrontFilters } from '@/components/storefront/storefront-filters';
import { StorefrontSearch } from '@/components/storefront/storefront-search';

describe('filtros do storefront', () => {
  it('aplica ordenação e disponibilidade a partir do diálogo acessível', () => {
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <div className="storefront-theme">
        <StorefrontFilters
          open
          onOpenChange={onOpenChange}
          sort="RELEVANCE"
          onlyAvailable={false}
          onApply={onApply}
        />
      </div>,
    );

    expect(screen.getByRole('dialog', { name: 'Filtrar cardápio' })).toBeVisible();
    fireEvent.click(screen.getByRole('radio', { name: /Menor preço/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Somente disponíveis/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(onApply).toHaveBeenCalledWith({
      sort: 'PRICE_ASC',
      onlyAvailable: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fecha com Escape e devolve o controle ao estado externo', async () => {
    const onOpenChange = vi.fn();
    render(
      <div className="storefront-theme">
        <StorefrontFilters
          open
          onOpenChange={onOpenChange}
          sort="RELEVANCE"
          onlyAvailable={false}
          onApply={vi.fn()}
        />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('anuncia a quantidade de filtros ativos sem alterar a busca', () => {
    const onFilterClick = vi.fn();
    const onChange = vi.fn();
    render(
      <StorefrontSearch
        value="pizza"
        onChange={onChange}
        onFilterClick={onFilterClick}
        activeFilterCount={2}
      />,
    );

    expect(screen.getByRole('searchbox')).toHaveValue('pizza');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros, 2 ativos' }));
    expect(onFilterClick).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('oferece skeletons para busca, filtros, categorias, destaques e produtos', () => {
    const { container } = render(<StorefrontLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando o cardápio da loja');
    expect(container.querySelector('.storefront-skeleton-search')).toBeTruthy();
    expect(container.querySelector('.storefront-skeleton-filter')).toBeTruthy();
    expect(container.querySelector('.storefront-skeleton-categories')).toBeTruthy();
    expect(container.querySelector('.storefront-skeleton-featured-card')).toBeTruthy();
    expect(container.querySelector('.storefront-skeleton-card')).toBeTruthy();
  });
});
