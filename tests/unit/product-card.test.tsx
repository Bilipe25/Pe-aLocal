import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductCard } from '@/components/storefront/product-card';

const ASSET_ID = '4da03571-bffd-45ef-8c44-20686c487838';
const baseProps = {
  name: 'Burger da casa',
  description: 'Pão, carne e queijo',
  basePrice: 2_500,
  isFeatured: false,
  isSoldOut: false,
  imageUrl: '/imagem-legada.jpg',
  imageAssetId: ASSET_ID,
  onClick: vi.fn(),
  showImage: true,
  showBadges: true,
  presentation: 'LIST' as const,
};

describe('imagem responsiva do produto', () => {
  it('usa o loader do Cloudflare/Images e srcSet com todas as larguras suportadas', () => {
    const { container } = render(<ProductCard {...baseProps} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', `/api/store-assets/${ASSET_ID}?width=384`);
    expect(image).toHaveAttribute(
      'srcset',
      expect.stringContaining(`/api/store-assets/${ASSET_ID}?width=96 96w`),
    );
    expect(image).toHaveAttribute(
      'srcset',
      expect.stringContaining(`/api/store-assets/${ASSET_ID}?width=1280 1280w`),
    );
    expect(image).toHaveAttribute('sizes', '(max-width: 639px) 104px, 128px');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('solicita imagem proporcional à variante compacta de destaque', () => {
    const { container } = render(<ProductCard {...baseProps} variant="featured" />);

    expect(container.querySelector('img')).toHaveAttribute(
      'sizes',
      '(max-width: 639px) 48vw, 13.5rem',
    );
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

  it('transita para is-loaded quando o next/image dispara onLoad', async () => {
    const { container } = render(<ProductCard {...baseProps} />);

    const image = container.querySelector('img')!;
    fireEvent.load(image);

    await waitFor(() => {
      expect(container.querySelector('.storefront-product-image-frame')).toHaveClass('is-loaded');
    });
    expect(container.querySelector('.storefront-product-image-placeholder')).toBeNull();
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

  it('preserva URL legada no src e não adiciona pipeline de transformação', () => {
    const { container } = render(<ProductCard {...baseProps} imageAssetId={null} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', '/imagem-legada.jpg');
    expect(image).toHaveAttribute('srcset');
    expect(image!.getAttribute('srcset')).not.toContain('/api/store-assets/');
  });

  it('permite favoritar e desfavoritar com estado acessível', () => {
    const onFavoriteToggle = vi.fn();
    const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });

    const { rerender } = render(
      <ProductCard {...baseProps} isFavorite={false} onFavoriteToggle={onFavoriteToggle} />,
    );

    const favorite = screen.getByRole('button', { name: 'Favoritar Burger da casa' });
    expect(favorite).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(favorite);
    expect(onFavoriteToggle).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith(12);
    expect(favorite).toHaveClass('is-pulsing');

    rerender(<ProductCard {...baseProps} isFavorite onFavoriteToggle={onFavoriteToggle} />);
    expect(
      screen.getByRole('button', { name: 'Remover Burger da casa dos favoritos' }),
    ).toHaveAttribute('aria-pressed', 'true');

    if (originalVibrate) {
      Object.defineProperty(navigator, 'vibrate', originalVibrate);
    } else {
      Reflect.deleteProperty(navigator, 'vibrate');
    }
  });

  it('mantém o favorito acionável quando o produto está esgotado', () => {
    render(<ProductCard {...baseProps} isSoldOut isFavorite onFavoriteToggle={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Remover Burger da casa dos favoritos' }),
    ).toBeEnabled();
  });
});
