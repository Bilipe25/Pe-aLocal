import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutForm } from '@/components/storefront/checkout-form';
import { getCheckoutDraftStorageKey, writeCheckoutDraft } from '@/lib/checkout/checkout-draft';
import type { CartItem } from '@/stores/cart-store';
import { getLastOrderStorageKey, useLastOrderStore } from '@/stores/last-order-store';

const PUBLIC_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const mocks = vi.hoisted(() => ({
  clearCart: vi.fn(),
  createOrderAction: vi.fn(),
  getCheckoutAvailabilityAction: vi.fn(),
  push: vi.fn(),
  setStore: vi.fn(),
}));

const cartItem: CartItem = {
  id: 'item-1',
  productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
  productName: 'Produto',
  basePrice: 2_000,
  quantity: 1,
  notes: '',
  selectedOptions: [],
  unitPrice: 2_000,
};

const cartState = {
  items: [cartItem],
  storeId: 'store-1',
  clearCart: mocks.clearCart,
  setStore: mocks.setStore,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/features/orders/actions', () => ({
  createOrderAction: mocks.createOrderAction,
  getCheckoutAvailabilityAction: mocks.getCheckoutAvailabilityAction,
}));
vi.mock('@/stores/cart-store', () => ({
  useCartStore: Object.assign(
    (selector: (state: typeof cartState) => unknown) => selector(cartState),
    { getState: () => cartState },
  ),
}));

function renderCheckout(overrides: Partial<React.ComponentProps<typeof CheckoutForm>> = {}) {
  return render(
    <CheckoutForm
      storeId="store-1"
      storeSlug="loja-1"
      minOrderValue={0}
      deliveryEnabled={false}
      pickupEnabled
      acceptsPix
      acceptsCash={false}
      acceptsCardOnDelivery={false}
      deliveryZones={[]}
      {...overrides}
    />,
  );
}

describe('checkout público', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
    useLastOrderStore.setState({ storeId: null, storeSlug: null, record: null });
    mocks.getCheckoutAvailabilityAction.mockResolvedValue({
      success: true,
      data: {
        acceptingOrders: true,
        state: 'OPEN',
        reason: 'Aberta agora.',
        nextTransitionAt: null,
      },
    });
    mocks.createOrderAction.mockResolvedValue({
      success: true,
      data: {
        publicToken: PUBLIC_TOKEN,
        orderNumber: 1,
        paymentReportToken: null,
      },
    });
  });

  it('aplica máscara nacional ao digitar ou colar número com DDI', () => {
    renderCheckout();

    const phone = screen.getByRole('textbox', { name: 'Telefone / WhatsApp' });
    fireEvent.change(phone, { target: { value: '+55 11 99999-9999' } });

    expect(phone).toHaveValue('(11) 99999-9999');
    expect(mocks.setStore).toHaveBeenCalledWith('store-1', 'loja-1');
  });

  it('mostra taxa, prazo e pedido mínimo da zona selecionada em região viva', () => {
    renderCheckout({
      minOrderValue: 1_500,
      deliveryEnabled: true,
      deliveryZones: [
        {
          id: '4da03571-bffd-45ef-8c44-20686c487838',
          name: 'Centro',
          fee: 500,
          estimatedTime: '30-40 min',
          minOrderValue: 2_500,
        },
      ],
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Zona de entrega' }), {
      target: { value: '4da03571-bffd-45ef-8c44-20686c487838' },
    });

    const details = document.getElementById('selected-zone-details');
    expect(details).not.toBeNull();
    expect(details).toHaveTextContent('Taxa de entrega: R$ 5,00');
    expect(details).toHaveTextContent('Prazo estimado: 30-40 min');
    expect(details).toHaveTextContent('Pedido mínimo: R$ 25,00');
  });

  it('bloqueia os controles enquanto revalida a disponibilidade', async () => {
    let resolveAvailability:
      | ((value: Awaited<ReturnType<typeof mocks.getCheckoutAvailabilityAction>>) => void)
      | undefined;
    mocks.getCheckoutAvailabilityAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAvailability = resolve;
      }),
    );
    renderCheckout();

    fireEvent.submit(screen.getByRole('button', { name: /Confirmar pedido/ }).closest('form')!);

    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Dados do pedido' })).toBeDisabled(),
    );
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeDisabled();

    resolveAvailability?.({
      success: true,
      data: {
        acceptingOrders: false,
        state: 'PAUSED',
        reason: 'Pedidos pausados.',
        nextTransitionAt: null,
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedidos pausados.');
  });

  it('preserva os campos e não cria pedido quando a loja fecha antes do envio', async () => {
    mocks.getCheckoutAvailabilityAction.mockResolvedValue({
      success: true,
      data: {
        acceptingOrders: false,
        state: 'CLOSED_BY_SCHEDULE',
        reason: 'A loja fechou agora.',
        nextTransitionAt: null,
      },
    });
    renderCheckout();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' }), {
      target: { value: '11999999999' },
    });

    fireEvent.submit(screen.getByRole('button', { name: /Confirmar pedido/ }).closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A loja fechou agora.');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Cliente Teste');
    expect(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' })).toHaveValue(
      '(11) 99999-9999',
    );
    expect(screen.getByRole('link', { name: 'Voltar ao cardápio' })).toHaveAttribute(
      'href',
      '/loja-1',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verificar novamente' })).toBeEnabled(),
    );
    expect(mocks.createOrderAction).not.toHaveBeenCalled();
  });

  it('trata a corrida quando a loja fecha depois do preflight', async () => {
    mocks.createOrderAction.mockResolvedValue({
      success: false,
      error: {
        code: 'BUSINESS_RULE_ERROR',
        message: 'A loja foi pausada.',
        details: [{ state: 'PAUSED', nextTransitionAt: null }],
      },
    });
    renderCheckout();

    fireEvent.submit(screen.getByRole('button', { name: /Confirmar pedido/ }).closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('A loja foi pausada.');
    expect(mocks.getCheckoutAvailabilityAction).toHaveBeenCalledOnce();
    expect(mocks.createOrderAction).toHaveBeenCalledOnce();
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });

  it('restaura somente o rascunho da loja atual e revalida escolhas disponíveis', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      customerName: 'Cliente Salvo',
      customerPhone: '11999999999',
      modality: 'DELIVERY',
      deliveryZoneId: 'zone-removida',
      deliveryAddress: 'Endereço antigo',
      paymentMethod: 'CASH',
    });
    writeCheckoutDraft(window.sessionStorage, 'store-2', {
      customerName: 'Outra Loja',
      customerPhone: '85999999999',
      modality: 'PICKUP',
      deliveryZoneId: '',
      deliveryAddress: '',
      paymentMethod: 'PIX',
    });

    renderCheckout();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Cliente Salvo'),
    );
    expect(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' })).toHaveValue(
      '(11) 99999-9999',
    );
    expect(screen.queryByDisplayValue('Outra Loja')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retirada/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('radio', { name: /Pix/ })).toBeChecked();
  });

  it('persiste o contrato mínimo sem observações nem valor de troco', async () => {
    renderCheckout();

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Rascunho' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' }), {
      target: { value: '11999999999' },
    });
    fireEvent.change(screen.getByPlaceholderText('Alguma observação para o estabelecimento?'), {
      target: { value: 'Informação livre que não deve persistir' },
    });

    await waitFor(
      () =>
        expect(window.sessionStorage.getItem(getCheckoutDraftStorageKey('store-1'))).not.toBeNull(),
      { timeout: 1_000 },
    );
    const persisted = JSON.parse(
      window.sessionStorage.getItem(getCheckoutDraftStorageKey('store-1'))!,
    );
    expect(persisted.customerName).toBe('Cliente Rascunho');
    expect(persisted).not.toHaveProperty('notes');
    expect(persisted).not.toHaveProperty('changeFor');
  });

  it('limpa o rascunho confirmado sem permitir que o timer o recrie', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      customerName: 'Cliente Salvo',
      customerPhone: '11999999999',
      modality: 'PICKUP',
      deliveryZoneId: '',
      deliveryAddress: '',
      paymentMethod: 'PIX',
    });
    renderCheckout();

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Cliente Salvo'),
    );
    fireEvent.submit(screen.getByRole('button', { name: /Confirmar pedido/ }).closest('form')!);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/loja-1/order/${PUBLIC_TOKEN}`));
    expect(window.sessionStorage.getItem(getCheckoutDraftStorageKey('store-1'))).toBeNull();
    expect(
      JSON.parse(window.localStorage.getItem(getLastOrderStorageKey('store-1')) ?? '{}'),
    ).toMatchObject({
      version: 1,
      trackingToken: PUBLIC_TOKEN,
      storeId: 'store-1',
      storeSlug: 'loja-1',
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(window.sessionStorage.getItem(getCheckoutDraftStorageKey('store-1'))).toBeNull();
  });
});

describe('mensagens de validação do checkout', () => {
  it('mostra o detalhe seguro retornado pelo servidor', async () => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.getCheckoutAvailabilityAction.mockResolvedValue({
      success: true,
      data: {
        acceptingOrders: true,
        state: 'OPEN',
        reason: 'Aberta agora.',
        nextTransitionAt: null,
      },
    });
    mocks.createOrderAction.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados do checkout inválidos',
        details: [{ path: 'items.0.productId', message: 'Produto inválido.' }],
      },
    });
    renderCheckout();

    fireEvent.submit(screen.getByRole('button', { name: /Confirmar pedido/ }).closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Produto inválido.');
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });
});
