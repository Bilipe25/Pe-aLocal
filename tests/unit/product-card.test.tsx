import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductCard } from '@/components/storefront/product-card';

const baseProps = {
  name: 'Burger da casa',
  description: 'Pão, carne e queijo',
  basePrice: 2_500,
  isFeatured: false,
  isSoldOut: false,
  imageUrl: '/imagem-legada.jpg',
  imageAssetId: '4da03571-bffd-45ef-8c44-20686c487838',
  onClick: vi.fn(),
  showImage: true,
  showBadges: true,
  presentation: 'LIST' as const,
};

describe('imagem responsiva do produto', () => {
  it('usa srcSet do pipeline Cloudflare com tamanho adequado ao card horizontal', () => {
    const { container } = render(<ProductCard {...baseProps} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute(
      'src',
      '/api/store-assets/4da03571-bffd-45ef-8c44-20686c487838?width=192',
    );
    expect(image).toHaveAttribute(
      'srcset',
      expect.stringContaining(
        '/api/store-assets/4da03571-bffd-45ef-8c44-20686c487838?width=96 96w',
      ),
    );
    expect(image).toHaveAttribute('sizes', '(max-width: 639px) 104px, 128px');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('mantém o espaço reservado e apresenta fallback quando a imagem falha', () => {
    const { container } = render(<ProductCard {...baseProps} />);

    const image = container.querySelector('img')!;
    fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(
      container.querySelector('[aria-label="Imagem indisponível para Burger da casa"]'),
    ).toHaveClass('storefront-product-image-frame', 'is-error');
    expect(screen.getByText('Imagem indisponível')).toBeVisible();
  });

  it('explica o estado sem imagem sem remover o produto do catálogo', () => {
    const { container } = render(
      <ProductCard {...baseProps} imageUrl={null} imageAssetId={null} />,
    );

    expect(container.querySelector('[aria-label="Burger da casa está sem imagem"]')).toHaveClass(
      'storefront-product-image-frame',
      'is-missing',
    );
    expect(screen.getByText('Sem imagem')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver produto: Burger da casa' })).toBeEnabled();
  });

  it('preserva URL legada sem gerar srcSet incompatível', () => {
    const { container } = render(<ProductCard {...baseProps} imageAssetId={null} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', '/imagem-legada.jpg');
    expect(image).not.toHaveAttribute('srcset');
  });

  it('permite favoritar e desfavoritar com estado acessível', () => {
    const onFavoriteToggle = vi.fn();
    const { rerender } = render(
      <ProductCard {...baseProps} isFavorite={false} onFavoriteToggle={onFavoriteToggle} />,
    );

    const favorite = screen.getByRole('button', { name: 'Favoritar Burger da casa' });
    expect(favorite).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(favorite);
    expect(onFavoriteToggle).toHaveBeenCalledOnce();

    rerender(<ProductCard {...baseProps} isFavorite onFavoriteToggle={onFavoriteToggle} />);
    expect(
      screen.getByRole('button', { name: 'Remover Burger da casa dos favoritos' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('mantém o favorito acionável quando o produto está esgotado', () => {
    render(<ProductCard {...baseProps} isSoldOut isFavorite onFavoriteToggle={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Remover Burger da casa dos favoritos' }),
    ).toBeEnabled();
  });
});
