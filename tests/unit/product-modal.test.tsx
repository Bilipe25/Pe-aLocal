import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductModal } from '@/components/storefront/product-modal';
import { useCartStore } from '@/stores/cart-store';
import type { PublicStorefrontProductSummaryDto } from '@/types/storefront';

const product: PublicStorefrontProductSummaryDto = {
  id: 'product-1',
  name: 'X-Bacon especial',
  description: 'Pão, carne, bacon e queijo',
  imageUrl: '/api/store-assets/asset-1?width=384',
  imageAssetId: 'asset-1',
  basePrice: 2_500,
  isFeatured: false,
  isSoldOut: false,
};

describe('detalhe fullscreen do produto', () => {
  afterEach(() => {
    useCartStore.setState({ storeId: null, storeSlug: null, items: [], couponCode: null });
  });

  it('mostra o summary no primeiro frame e limita o loading à configuração', () => {
    render(
      <ProductModal
        product={product}
        detail={null}
        detailStatus="loading"
        onRetry={() => undefined}
        onClose={() => undefined}
        storeOpen
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('X-Bacon especial');
    expect(screen.getByRole('dialog')).toHaveTextContent('Pão, carne, bacon e queijo');
    expect(screen.getByRole('dialog')).toHaveTextContent('R$ 25,00');
    expect(document.querySelector('#product-details-loading')).toHaveTextContent(
      'Preparando adicionais e opções do produto.',
    );
    expect(screen.getByRole('button', { name: 'Preparando opções…' })).toBeDisabled();
  });

  it('reutiliza a variante do card como preview e prioriza a imagem fullscreen', () => {
    render(
      <ProductModal
        product={product}
        detail={null}
        detailStatus="loading"
        onRetry={() => undefined}
        onClose={() => undefined}
        storeOpen
      />,
    );

    const preview = document.querySelector('.storefront-product-image-preview');
    const criticalImage = document.querySelector('.storefront-product-image');
    expect(preview).toHaveAttribute('src', '/api/store-assets/asset-1?width=384');
    expect(criticalImage).toHaveAttribute('loading', 'eager');
    expect(criticalImage).toHaveAttribute('fetchpriority', 'high');
    expect(criticalImage).toHaveAttribute('data-asset-target-width', '768');
  });
});
