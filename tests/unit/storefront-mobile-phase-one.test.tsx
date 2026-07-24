import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartFab } from '@/components/storefront/cart-fab';
import { CategoryNav } from '@/components/storefront/category-nav';
import { ProductCard } from '@/components/storefront/product-card';
import { StorefrontHero } from '@/components/storefront/storefront-hero';
import { createDefaultCustomization } from '@/features/customization/domain/defaults';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  clipboardWrite: vi.fn(),
}));

const cartState = {
  storeId: 'store-1',
  storeSlug: 'loja-teste',
  items: [
    {
      id: 'line-1',
      productId: 'product-1',
      productName: 'Prato da casa',
      basePrice: 3_190,
      quantity: 2,
      notes: '',
      selectedOptions: [],
      unitPrice: 3_190,
    },
  ],
};

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/stores/cart-store', () => ({
  selectCartStoreId: (state: typeof cartState) => state.storeId,
  selectCartStoreSlug: (state: typeof cartState) => state.storeSlug,
  selectCartItemCount: (state: typeof cartState) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  selectCartTotal: (state: typeof cartState) =>
    state.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  useCartStore: (selector: (state: typeof cartState) => unknown) => selector(cartState),
}));

const baseHeroProps = {
  name: 'Sabor da Vila',
  description: 'Comida brasileira feita com cuidado.',
  availability: {
    acceptingOrders: true,
    state: 'OPEN' as const,
    reason: 'Aberta agora.',
    nextTransitionAt: null,
  },
  estimatedTime: '30–45 min',
  minOrderValue: 2_500,
  deliveryEnabled: true,
  pickupEnabled: true,
  minDeliveryFee: 500,
  openingHours: [{ dayOfWeek: 'MONDAY', openTime: '11:00', closeTime: '22:00' }],
  neighborhood: 'Centro',
  city: 'Fortaleza',
  logoUrl: null,
  coverUrl: null,
  config: createDefaultCustomization(),
};

describe('storefront mobile — fase 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.clipboardWrite },
    });
  });

  it('apresenta hero aberto com fallback visual e informações operacionais reais', () => {
    render(<StorefrontHero {...baseHeroProps} />);

    expect(screen.getByRole('heading', { name: 'Sabor da Vila' })).toBeVisible();
    expect(screen.getByText('Aberta agora')).toBeVisible();
    expect(screen.getByLabelText('Preparo estimado: 30–45 min')).toBeVisible();
    expect(screen.getByLabelText('Pedido mínimo: R$ 25,00')).toBeVisible();
    expect(screen.getByLabelText('Sabor da Vila')).toBeVisible();
  });

  it.each([
    {
      state: 'CLOSED_BY_SCHEDULE' as const,
      label: 'Fechada agora',
      reason: 'Fechada agora pelo horário. Abre amanhã, 11:00.',
    },
    {
      state: 'PAUSED' as const,
      label: 'Pedidos pausados',
      reason: 'Os pedidos estão pausados temporariamente.',
    },
  ])('explica o estado $state sem depender apenas da cor', ({ state, label, reason }) => {
    render(
      <StorefrontHero
        {...baseHeroProps}
        availability={{
          acceptingOrders: false,
          state,
          reason,
          nextTransitionAt: null,
        }}
      />,
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(reason);
  });

  it('copia o link quando Web Share não está disponível', async () => {
    mocks.clipboardWrite.mockResolvedValue(undefined);
    render(<StorefrontHero {...baseHeroProps} shareUrl="https://pedido.local/sabor" />);

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar cardápio de Sabor da Vila' }));

    await waitFor(() =>
      expect(mocks.clipboardWrite).toHaveBeenCalledWith('https://pedido.local/sabor'),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Link do cardápio copiado.');
  });

  it('expõe categoria ativa e mantém os chips acionáveis', () => {
    const onCategoryClick = vi.fn();
    render(
      <CategoryNav
        categories={[
          { id: 'cat-1', name: 'Pratos', imageUrl: null, imageAlt: null },
          { id: 'cat-2', name: 'Bebidas', imageUrl: null, imageAlt: null },
        ]}
        activeCategoryId="cat-1"
        onCategoryClick={onCategoryClick}
        variant="HORIZONTAL_STICKY"
        showImages={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pratos' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(onCategoryClick).toHaveBeenCalledWith('cat-2');
  });

  it.each(['featured', 'horizontal', 'compact'] as const)(
    'renderiza a variante %s com ação acessível',
    (variant) => {
      const onClick = vi.fn();
      const { container } = render(
        <ProductCard
          name="Prato da casa"
          description="Arroz, feijão e acompanhamentos."
          basePrice={3_190}
          isFeatured
          isSoldOut={false}
          imageUrl={null}
          imageAssetId={null}
          onClick={onClick}
          showImage
          showBadges
          variant={variant}
        />,
      );

      expect(container.querySelector(`.storefront-product-variant-${variant}`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Ver opções de Prato da casa' }));
      expect(onClick).toHaveBeenCalledOnce();
    },
  );

  it('mantém produto esgotado identificável e sem ação', () => {
    render(
      <ProductCard
        name="Prato esgotado"
        description={null}
        basePrice={2_500}
        isFeatured={false}
        isSoldOut
        imageUrl={null}
        imageAssetId={null}
        onClick={vi.fn()}
        showImage
        showBadges
        variant="horizontal"
      />,
    );

    expect(screen.getByText('Esgotado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Prato esgotado está esgotado' })).toBeDisabled();
  });

  it('resume quantidade e total no carrinho flutuante isolado pela loja', () => {
    render(<CartFab storeId="store-1" />);

    const link = screen.getByRole('link', {
      name: /Ver carrinho com 2 itens, total R\$\s63,80/,
    });
    expect(link).toHaveAttribute('href', '/loja-teste/cart');
    expect(screen.getByText('2 itens')).toBeVisible();
    expect(screen.getByText('R$ 63,80')).toBeVisible();
  });
});
