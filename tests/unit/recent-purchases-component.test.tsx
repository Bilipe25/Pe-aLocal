import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecentPurchasesSection } from '@/components/storefront/recent-purchases-section';
import { selectCartTotal, useCartStore } from '@/stores/cart-store';
import type { PublicRecentPurchaseProductDto } from '@/types/storefront';

const mocks = vi.hoisted(() => ({
  reportEvent: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/checkout/telemetry', () => ({
  reportStorefrontEvent: mocks.reportEvent,
}));
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function product(
  requiresConfiguration = false,
  id = '00000000-0000-0000-0002-000000000001',
): PublicRecentPurchaseProductDto {
  return {
    id,
    name: requiresConfiguration ? 'Pizza configurável' : 'X-Bacon',
    description: 'Descrição atual',
    imageUrl: null,
    imageAssetId: null,
    basePrice: requiresConfiguration ? 4_590 : 3_290,
    isAvailable: true,
    isFeatured: true,
    isSoldOut: false,
    category: { id: 'category-a', name: 'Lanches' },
    requiresConfiguration,
  };
}

describe('vitrine Peça de novo', () => {
  let queuedFrame: FrameRequestCallback | null;

  beforeEach(() => {
    vi.clearAllMocks();
    queuedFrame = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    useCartStore.setState({
      storeId: 'store-a',
      storeSlug: 'burger-do-ze',
      items: [],
      couponCode: null,
      revision: 0,
      updatedAt: 0,
    });
  });

  it('não renderiza título nem container sem produtos elegíveis', () => {
    const { container } = render(
      <RecentPurchasesSection
        products={[]}
        storeSlug="burger-do-ze"
        storeOpen
        showImages
        onOpenProduct={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Peça de novo' })).not.toBeInTheDocument();
  });

  it('adiciona produto simples com preço atual e preserva a página', async () => {
    render(
      <RecentPurchasesSection
        products={[product()]}
        storeSlug="burger-do-ze"
        storeOpen
        showImages
        onOpenProduct={vi.fn()}
      />,
    );

    const action = screen.getByRole('button', {
      name: /Pedir X-Bacon novamente por R\$\s*32,90/,
    });
    fireEvent.click(action);
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-busy', 'true');
    act(() => queuedFrame?.(performance.now()));

    await waitFor(() =>
      expect(useCartStore.getState().items).toEqual([
        expect.objectContaining({
          productId: '00000000-0000-0000-0002-000000000001',
          productName: 'X-Bacon',
          unitPrice: 3_290,
          selectedOptions: [],
        }),
      ]),
    );
    expect(selectCartTotal(useCartStore.getState())).toBe(3_290);
    expect(mocks.reportEvent).toHaveBeenCalledWith('burger-do-ze', {
      event: 'recent_purchase_product_clicked',
      productId: '00000000-0000-0000-0002-000000000001',
      position: 0,
    });
    expect(mocks.reportEvent).toHaveBeenCalledWith('burger-do-ze', {
      event: 'recent_purchase_product_added',
      productId: '00000000-0000-0000-0002-000000000001',
      position: 0,
    });
    expect(screen.getByRole('status')).toHaveTextContent('X-Bacon adicionado à sacola.');
  });

  it('abre o modal atual sem restaurar opções antigas para produto configurável', () => {
    const openProduct = vi.fn();
    const configurable = product(true, '00000000-0000-0000-0002-000000000002');
    render(
      <RecentPurchasesSection
        products={[configurable]}
        storeSlug="burger-do-ze"
        storeOpen
        showImages
        onOpenProduct={openProduct}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Revisar opções de Pizza configurável por R\$\s*45,90/,
      }),
    );

    expect(openProduct).toHaveBeenCalledWith(configurable);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('desabilita recompra quando a loja não aceita pedidos', () => {
    render(
      <RecentPurchasesSection
        products={[product()]}
        storeSlug="burger-do-ze"
        storeOpen={false}
        showImages
        onOpenProduct={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Loja fechada/ })).toBeDisabled();
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('usa região semântica, trilho nativo e alvos de toque de 44 px', () => {
    render(
      <RecentPurchasesSection
        products={[product()]}
        storeSlug="burger-do-ze"
        storeOpen
        showImages={false}
        onOpenProduct={vi.fn()}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Peça de novo' });
    const section = heading.closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'recent-purchases-title');
    expect(
      within(section!).getByRole('list', { name: 'Produtos comprados recentemente' }),
    ).toBeInTheDocument();

    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('.storefront-recent-track');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('scroll-snap-type: x proximity');
    expect(css).toContain('min-height: 2.75rem');
    expect(css).toContain('width: min(72vw, 17rem)');
  });
});
