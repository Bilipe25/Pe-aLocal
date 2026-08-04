import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartRecommendations } from '@/components/storefront/cart-recommendations';
import { selectCartTotal, useCartStore } from '@/stores/cart-store';

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
vi.mock('next/dynamic', () => ({
  default: () =>
    function ConfiguratorStub({ recommendation }: { recommendation: { name: string } }) {
      return <div data-testid="recommendation-configurator">{recommendation.name}</div>;
    },
}));

const currentProductId = '00000000-0000-0000-0002-000000000001';
const recommendationId = '00000000-0000-0000-0002-000000000002';

function recommendation(requiresConfiguration = false) {
  return {
    id: recommendationId,
    name: 'Coca-Cola Zero',
    basePrice: 690,
    imageUrl: null,
    imageAssetId: null,
    category: { id: 'category-drinks', name: 'Bebidas' },
    isAvailable: true,
    isFeatured: true,
    requiresConfiguration,
  };
}

function response(recommendations: ReturnType<typeof recommendation>[]) {
  return new Response(JSON.stringify({ recommendations }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('recomendações no carrinho', () => {
  let queuedFrame: FrameRequestCallback | null;

  beforeEach(() => {
    vi.clearAllMocks();
    queuedFrame = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    useCartStore.setState({
      storeId: 'store-1',
      storeSlug: 'burger-do-ze',
      items: [
        {
          id: 'line-current',
          productId: currentProductId,
          productName: 'Burger da casa',
          basePrice: 2_500,
          quantity: 1,
          notes: '',
          selectedOptions: [],
          unitPrice: 2_500,
        },
      ],
      couponCode: null,
      revision: 1,
      updatedAt: 1,
    });
  });

  it('mantém um skeleton compacto enquanto carrega', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    const { container } = render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    expect(screen.getByRole('heading', { name: 'Que tal adicionar algo?' })).toBeVisible();
    expect(container.querySelectorAll('.storefront-cart-recommendation-skeleton')).toHaveLength(3);
  });

  it('oculta totalmente a seção quando não há recomendação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Que tal adicionar algo?' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('não consulta recomendações quando a loja está fechada', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen={false} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Que tal adicionar algo?' }),
    ).not.toBeInTheDocument();
  });

  it('adiciona produto simples diretamente, atualiza quantidade e total e anuncia a ação', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([recommendation()]))
      .mockResolvedValue(response([]));
    vi.stubGlobal('fetch', fetchMock);

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    const add = await screen.findByRole('button', {
      name: /Adicionar Coca-Cola Zero ao carrinho por R\$\s*6,90/,
    });
    fireEvent.click(add);

    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('aria-busy', 'true');
    expect(queuedFrame).not.toBeNull();

    act(() => queuedFrame?.(performance.now()));

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(2));
    expect(useCartStore.getState().items[1]).toMatchObject({
      productId: recommendationId,
      quantity: 1,
      selectedOptions: [],
    });
    expect(selectCartTotal(useCartStore.getState())).toBe(3_190);
    expect(mocks.reportEvent).toHaveBeenCalledWith('burger-do-ze', {
      event: 'recommendation_added',
      productId: recommendationId,
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Adicionado à sacola',
      expect.objectContaining({ description: 'Coca-Cola Zero foi incluído no pedido.' }),
    );
  });

  it('abre o configurador sem adicionar automaticamente quando existem opções', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([recommendation(true)])));

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    fireEvent.click(
      await screen.findByRole('button', { name: /Configurar Coca-Cola Zero por R\$\s*6,90/ }),
    );

    expect(await screen.findByTestId('recommendation-configurator')).toHaveTextContent(
      'Coca-Cola Zero',
    );
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('preserva um destino de foco e o anúncio ao remover o card recém-adicionado', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response([recommendation()]))
        .mockResolvedValue(response([])),
    );

    render(
      <>
        <CartRecommendations storeSlug="burger-do-ze" storeOpen />
        <button type="button" data-cart-summary-action>
          Finalizar pedido
        </button>
      </>,
    );

    const add = await screen.findByRole('button', {
      name: /Adicionar Coca-Cola Zero ao carrinho por R\$\s*6,90/,
    });
    add.focus();
    fireEvent.click(add);
    act(() => queuedFrame?.(performance.now()));

    // Verifica a mensagem imediatamente antes que qualquer timeout (como o de 2s) ou atraso do runner a limpe
    expect(screen.getByRole('status')).toHaveTextContent('Coca-Cola Zero adicionado ao carrinho.');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finalizar pedido' })).toHaveFocus(),
    );
  });

  it('não bloqueia o carrinho quando a recomendação falha e permite tentar novamente', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    const retry = await screen.findByRole('button', { name: 'Tentar carregar sugestões' });
    expect(useCartStore.getState().items).toHaveLength(1);

    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('usa trilho nativo com cards horizontais compactos sem overflow em 320 px', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([recommendation()])));

    render(<CartRecommendations storeSlug="burger-do-ze" storeOpen />);

    const track = await screen.findByRole('list', {
      name: 'Sugestões para completar o pedido',
    });
    expect(track).toHaveAttribute('tabindex', '0');

    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('clamp(12.5rem, 64vw, 14rem)');
    expect(css).toContain('height: 5rem');
    expect(css).toContain('grid-template-columns: 4rem minmax(0, 1fr) 2.75rem');
    expect(css).toContain('width: 2.75rem');
  });
});
