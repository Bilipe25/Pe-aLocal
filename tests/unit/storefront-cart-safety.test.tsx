import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartView } from '@/components/storefront/cart-view';
import { getCartStorageKey, useCartStore, type CartItem } from '@/stores/cart-store';
import { useLastOrderStore } from '@/stores/last-order-store';

const mocks = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  });

  return {
    retryQuote: vi.fn(),
    subscribeToCartStorage: vi.fn(() => vi.fn()),
    toast,
  };
});

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/components/storefront/cart-recommendations', () => ({
  CartRecommendations: () => null,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function CartItemEditorStub({ item, onClose }: { item: CartItem; onClose: () => void }) {
      return (
        <div role="dialog" aria-label={`Editor de ${item.productName}`}>
          <span data-testid="editing-line-id">{item.id}</span>
          <span data-testid="editing-options">
            {item.selectedOptions.map((option) => option.name).join(', ')}
          </span>
          <button type="button" onClick={onClose}>
            Fechar editor
          </button>
        </div>
      );
    },
}));
vi.mock('@/stores/cart-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/cart-store')>();
  return {
    ...actual,
    subscribeToCartStorage: mocks.subscribeToCartStorage,
  };
});
vi.mock('@/hooks/use-cart-quote', () => ({
  useCartQuote: ({ items, couponCode }: { items: CartItem[]; couponCode?: string | null }) => {
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const normalizedCoupon = couponCode?.trim().toUpperCase() ?? null;
    const couponIsValid = normalizedCoupon === 'BEMVINDO10';
    const couponIsInvalid = Boolean(normalizedCoupon) && !couponIsValid;
    const discount = couponIsValid ? 500 : 0;
    return {
      status: 'success',
      error: null,
      retry: mocks.retryQuote,
      quote: {
        canCheckout: !couponIsInvalid,
        subtotal,
        discount,
        total: subtotal - discount,
        coupon: couponIsValid ? { code: normalizedCoupon, discount } : null,
        minOrderValue: 0,
        missingForMinimum: 0,
        promisedFulfillmentMinAt: '2026-07-22T18:30:00.000Z',
        promisedFulfillmentMaxAt: '2026-07-22T18:50:00.000Z',
        issues: couponIsInvalid
          ? [
              {
                code: 'COUPON_INVALID',
                message: 'Este cupom não está disponível para este pedido.',
              },
            ]
          : [],
        lines: items.map((item) => ({
          lineId: item.id,
          productName: item.productName,
          imageUrl: item.imageUrl ?? null,
          imageAssetId: item.imageAssetId ?? null,
          options: item.selectedOptions,
          unitPrice: item.unitPrice,
          itemTotal: item.unitPrice * item.quantity,
        })),
      },
    };
  },
}));

const items: CartItem[] = [
  {
    id: 'line-bacon',
    productId: 'product-burger',
    productName: 'X-Burguer Clássico',
    basePrice: 2_500,
    quantity: 1,
    notes: 'bem passado',
    selectedOptions: [{ id: 'bacon', name: 'Bacon extra', price: 300 }],
    unitPrice: 2_800,
  },
  {
    id: 'line-egg',
    productId: 'product-burger',
    productName: 'X-Burguer Clássico',
    basePrice: 2_500,
    quantity: 1,
    notes: '',
    selectedOptions: [{ id: 'egg', name: 'Ovo', price: 200 }],
    unitPrice: 2_700,
  },
];

function renderCart(storeName = 'Burger do Zé') {
  return render(
    <div className="storefront-theme">
      <CartView
        storeId="store-active"
        storeSlug="burger-do-ze"
        storeName={storeName}
        acceptingOrders
        unavailableReason=""
      />
    </div>,
  );
}

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
  };
}

describe('segurança e clareza do carrinho público', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    useCartStore.setState({
      storeId: 'store-active',
      storeSlug: 'burger-do-ze',
      items: structuredClone(items),
      couponCode: null,
      revision: 1,
      updatedAt: 1,
    });
    useLastOrderStore.setState({ storeId: null, storeSlug: null, record: null });
  });

  it('exige confirmação e mantém os itens ao cancelar, usar Escape ou clicar no overlay', async () => {
    renderCart();
    const trigger = screen.getByRole('button', { name: 'Esvaziar sacola' });

    fireEvent.click(trigger);
    expect(screen.getByRole('heading', { name: 'Esvaziar a sacola?' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(useCartStore.getState().items).toHaveLength(2);

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Esvaziar a sacola?' })).not.toBeInTheDocument(),
    );
    expect(useCartStore.getState().items).toHaveLength(2);

    fireEvent.click(trigger);
    const overlay = document.querySelector('.confirm-dialog-overlay');
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!);
    fireEvent.click(overlay!);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Esvaziar a sacola?' })).not.toBeInTheDocument(),
    );
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('bloqueia a confirmação durante o processamento e limpa somente a loja ativa', async () => {
    let queuedFrame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    });
    const otherStoreKey = getCartStorageKey('store-other');
    localStorage.setItem(otherStoreKey, '{"preserved":true}');
    renderCart();

    fireEvent.click(screen.getByRole('button', { name: 'Esvaziar sacola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Esvaziar sacola' }));

    const pendingButton = screen.getByRole('button', { name: 'Esvaziando…' });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute('aria-busy', 'true');
    expect(useCartStore.getState().items).toHaveLength(2);

    act(() => queuedFrame?.(performance.now()));

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(0));
    expect(localStorage.getItem(otherStoreKey)).toBe('{"preserved":true}');
    expect(screen.getByRole('status')).toHaveTextContent('Sacola esvaziada.');
    expect(mocks.toast.success).toHaveBeenCalledWith('Sacola esvaziada');
  });

  it('expõe ações diretas, edita a linha correta e preserva suas customizações', async () => {
    renderCart();

    expect(screen.queryByRole('button', { name: /Opções de/ })).not.toBeInTheDocument();
    const editButtons = screen.getAllByRole('button', { name: 'Editar X-Burguer Clássico' });
    fireEvent.click(editButtons[1]);

    expect(
      await screen.findByRole('dialog', { name: 'Editor de X-Burguer Clássico' }),
    ).toBeVisible();
    expect(screen.getByTestId('editing-line-id')).toHaveTextContent('line-egg');
    expect(screen.getByTestId('editing-options')).toHaveTextContent('Ovo');
  });

  it('remove somente a linha escolhida, recalcula o subtotal e anuncia a remoção', async () => {
    renderCart();

    const removeButtons = screen.getAllByRole('button', {
      name: 'Remover X-Burguer Clássico da sacola',
    });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1));
    expect(useCartStore.getState().items[0]).toMatchObject({
      id: 'line-egg',
      selectedOptions: [{ id: 'egg' }],
    });
    expect(
      screen.getByRole('link', { name: /Continuar para o checkout · R\$\s*27,00/ }),
    ).toHaveClass('storefront-cart-checkout-action');
    expect(
      screen.getByText('X-Burguer Clássico removido da sacola.', {
        selector: '[role="status"]',
      }),
    ).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      'X-Burguer Clássico removido',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Desfazer' }),
      }),
    );
  });

  it('aplica e remove um cupom pela faixa expansível, atualizando desconto, total e CTA', async () => {
    renderCart();

    expect(screen.getByLabelText('Código do cupom')).not.toBeVisible();
    const couponTrigger = screen.getByRole('button', { name: /Tem um cupom\?/ });
    expect(couponTrigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(couponTrigger);
    expect(couponTrigger).toHaveAttribute('aria-expanded', 'true');
    const couponInput = screen.getByLabelText('Código do cupom');
    fireEvent.change(couponInput, { target: { value: 'bemvindo10' } });
    fireEvent.submit(couponInput.closest('form')!);

    await waitFor(() => expect(useCartStore.getState().couponCode).toBe('BEMVINDO10'));
    expect(await screen.findByText('Cupom BEMVINDO10 aplicado')).toBeVisible();
    expect(screen.getByText('Você economizou R$ 5,00')).toBeVisible();
    expect(screen.getByText('− R$ 5,00')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Continuar para o checkout · R\$\s*50,00/ }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(useCartStore.getState().couponCode).toBeNull());
    expect(screen.getByRole('button', { name: /Tem um cupom\?/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('mantém o cupom inválido aberto, associa o erro ao campo e permite corrigi-lo', async () => {
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /Tem um cupom\?/ }));
    const couponInput = screen.getByLabelText('Código do cupom');
    fireEvent.change(couponInput, { target: { value: 'invalido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(
      await screen.findByText('Este cupom não está disponível para este pedido.'),
    ).toHaveAttribute('role', 'alert');
    expect(couponInput).toHaveValue('INVALIDO');
    expect(couponInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Revise a sacola' })).toBeDisabled();

    fireEvent.change(couponInput, { target: { value: 'bemvindo10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByText('Cupom BEMVINDO10 aplicado')).toBeVisible();
  });

  it('mantém cabeçalho leve, fallback de logo e nome longo sem seletor frágil', () => {
    renderCart('Restaurante e Hamburgueria Artesanal do Bairro com Nome Muito Longo');

    expect(screen.getByRole('heading', { name: 'Sua sacola', level: 1 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar ao cardápio' })).toHaveAttribute(
      'href',
      '/burger-do-ze',
    );
    expect(screen.getByText(/Restaurante e Hamburgueria Artesanal/)).toBeVisible();
    expect(document.querySelector('.storefront-purchase-logo > svg')).not.toBeNull();

    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('background: var(--store-surface-raised)');
    expect(css).toContain('-webkit-line-clamp: 2');
    expect(css).toContain('color: var(--store-danger)');
    expect(css).not.toContain('.storefront-cart-line-menu-trigger');
  });

  it('oferece link para continuar comprando no cardápio', () => {
    renderCart();

    const continueLink = screen.getByRole('link', { name: 'Continuar comprando no cardápio' });
    expect(continueLink).toHaveAttribute('href', '/burger-do-ze');
    expect(continueLink).toHaveTextContent('Continuar comprando');
  });

  it('mostra a janela de previsão calculada pelo quote no resumo', () => {
    renderCart();

    expect(screen.getByText('Previsão para retirada')).toBeVisible();
    expect(screen.getByText('15:30–15:50')).toBeVisible();
  });
});
