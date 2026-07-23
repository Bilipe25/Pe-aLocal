import { fireEvent, render } from '@testing-library/react';
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
  it('usa srcSet do pipeline Cloudflare com tamanho adequado à lista', () => {
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
    expect(image).toHaveAttribute('sizes', '64px');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('mantém o espaço reservado e oculta a imagem que falhou', () => {
    const { container } = render(<ProductCard {...baseProps} />);

    const image = container.querySelector('img')!;
    fireEvent.error(image);

    expect(image).toHaveAttribute('hidden');
    expect(image.parentElement).toHaveClass('storefront-product-image-wrap');
  });

  it('preserva URL legada sem gerar srcSet incompatível', () => {
    const { container } = render(<ProductCard {...baseProps} imageAssetId={null} />);

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', '/imagem-legada.jpg');
    expect(image).not.toHaveAttribute('srcset');
  });
});
