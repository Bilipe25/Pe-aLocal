import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutForm, describeQuoteChanges } from '@/components/storefront/checkout-form';
import { writeCheckoutDraft } from '@/lib/checkout/checkout-draft';
import {
  clearPaymentReportToken,
  readPaymentReportToken,
} from '@/lib/orders/payment-report-token-memory';
import type { CartItem } from '@/stores/cart-store';
import { useLastOrderStore } from '@/stores/last-order-store';
import type { CheckoutQuoteDto } from '@/types/storefront';

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
  fetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  reportCheckoutAbandonment: vi.fn(),
  reportCheckoutEvent: vi.fn(),
  setCouponCode: vi.fn(),
  setStore: vi.fn(),
  storageCleanup: vi.fn(),
  subscribeToCartStorage: vi.fn(),
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
  couponCode: null as string | null,
  clearCart: mocks.clearCart,
  setCouponCode: mocks.setCouponCode,
  setStore: mocks.setStore,
};

const quote: CheckoutQuoteDto = {
  quoteFingerprint: 'a'.repeat(64),
  storeId: 'store-1',
  storeSlug: 'loja-1',
  lines: [
    {
      lineId: cartItem.id,
      productId: cartItem.productId,
      productName: cartItem.productName,
      imageUrl: null,
      imageAssetId: null,
      quantity: 1,
      notes: '',
      options: [],
      unitPrice: 2_000,
      itemTotal: 2_000,
    },
  ],
  subtotal: 2_000,
  discount: 0,
  deliveryFee: 500,
  total: 2_500,
  minOrderValue: 0,
  missingForMinimum: 0,
  deliveryZoneId: '4da03571-bffd-45ef-8c44-20686c487838',
  deliveryZoneName: 'Centro',
  estimatedMinMinutes: 30,
  estimatedMaxMinutes: 50,
  promisedFulfillmentMinAt: '2026-07-27T22:30:00.000Z',
  promisedFulfillmentMaxAt: '2026-07-27T22:50:00.000Z',
  coupon: null,
  issues: [],
  canCheckout: true,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('@/features/orders/actions', () => ({
  createOrderAction: mocks.createOrderAction,
}));
vi.mock('@/lib/checkout/telemetry', () => ({
  reportCheckoutAbandonment: mocks.reportCheckoutAbandonment,
  reportCheckoutEvent: mocks.reportCheckoutEvent,
}));
vi.mock('@/stores/cart-store', () => ({
  selectCartCouponCode: (state: typeof cartState) => state.couponCode,
  subscribeToCartStorage: mocks.subscribeToCartStorage,
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
      {...overrides}
    />,
  );
}

describe('checkout público v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cartState.couponCode = null;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.scrollTo = vi.fn();
    clearPaymentReportToken(PUBLIC_TOKEN);
    useLastOrderStore.setState({ storeId: null, storeSlug: null, record: null });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => quote,
    });
    mocks.createOrderAction.mockResolvedValue({
      success: true,
      data: {
        publicToken: PUBLIC_TOKEN,
        orderNumber: 1,
        paymentReportToken: null,
      },
    });
    mocks.subscribeToCartStorage.mockReturnValue(mocks.storageCleanup);
  });

  it('aplica máscara nacional e registra o início sem enviar dados pessoais', () => {
    renderCheckout();

    const phone = screen.getByRole('textbox', { name: 'Telefone / WhatsApp' });
    fireEvent.change(phone, { target: { value: '+55 11 99999-9999' } });

    expect(phone).toHaveValue('(11) 99999-9999');
    expect(mocks.setStore).toHaveBeenCalledWith('store-1', 'loja-1');
    expect(mocks.reportCheckoutEvent).toHaveBeenCalledWith('loja-1', {
      event: 'checkout_started',
      step: 'identification',
    });
  });

  it('restaura o CEP da sacola pelo sessionStorage, sem depender da URL', () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      customerName: '',
      customerPhone: '',
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
      deliveryPostalCode: '01001000',
      couponCode: 'BEMVINDO10',
    });
    renderCheckout({
      deliveryEnabled: true,
      initialStep: 'fulfillment',
      initialModality: 'DELIVERY',
      initialCouponCode: 'BEMVINDO10',
    });

    expect(screen.getByRole('button', { name: 'Entrega' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'CEP' })).toHaveValue('01001-000');
  });

  it('não expõe o CEP na URL ao avançar as etapas', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      customerName: '',
      customerPhone: '',
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
      deliveryPostalCode: '01001000',
    });
    renderCheckout({
      deliveryEnabled: true,
      initialModality: 'DELIVERY',
    });
    await waitFor(() => expect(mocks.setStore).toHaveBeenCalledWith('store-1', 'loja-1'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' }), {
      target: { value: '11999999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para recebimento' }));

    await screen.findByRole('heading', { name: 'Como quer receber?' });
    expect(mocks.replace).toHaveBeenCalledWith(
      '/loja-1/checkout?step=fulfillment&modality=DELIVERY',
      { scroll: false },
    );
    expect(mocks.replace.mock.calls.flat().join(' ')).not.toContain('postalCode');
  });

  it('só valida o endereço depois de o servidor confirmar a cobertura', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      customerName: '',
      customerPhone: '',
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
      deliveryPostalCode: '01001000',
    });
    renderCheckout({
      deliveryEnabled: true,
      initialStep: 'fulfillment',
      initialModality: 'DELIVERY',
    });

    expect(screen.queryByRole('textbox', { name: 'Rua' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));

    expect(await screen.findByRole('textbox', { name: 'Rua' })).toBeVisible();
    expect(await screen.findByText('Informe a rua.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
  });

  it.each([
    {
      label: /Complemento/,
      value: 'A'.repeat(121),
      errorId: 'complement-error',
      message: 'Use no máximo 120 caracteres.',
    },
    {
      label: /Referência/,
      value: 'B'.repeat(201),
      errorId: 'reference-error',
      message: 'Use no máximo 200 caracteres.',
    },
  ])(
    'associa, anuncia e focaliza o primeiro erro real de $errorId',
    async ({ label, value, errorId, message }) => {
      writeCheckoutDraft(window.sessionStorage, 'store-1', {
        customerName: '',
        customerPhone: '',
        modality: 'DELIVERY',
        paymentMethod: 'PIX',
        deliveryPostalCode: '01001000',
      });
      const { container } = renderCheckout({
        deliveryEnabled: true,
        initialModality: 'DELIVERY',
      });

      fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
        target: { value: 'Cliente Teste' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' }), {
        target: { value: '11999999999' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar para recebimento' }));

      const street = await screen.findByRole('textbox', { name: 'Rua' }, { timeout: 5_000 });
      fireEvent.change(street, { target: { value: 'Rua das Flores' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Bairro' }), {
        target: { value: 'Centro' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Número' }), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Cidade' }), {
        target: { value: 'São Paulo' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'UF' }), {
        target: { value: 'SP' },
      });

      const invalidInput = screen.getByRole('textbox', { name: label });
      fireEvent.change(invalidInput, { target: { value } });
      fireEvent.submit(container.querySelector('form')!);

      expect(await screen.findByText(message)).toHaveAttribute('id', errorId);
      expect(invalidInput).toHaveAttribute('aria-invalid', 'true');
      expect(invalidInput).toHaveAttribute('aria-describedby', errorId);
      await waitFor(() => expect(invalidInput).toHaveFocus());
      expect(screen.getByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
    },
  );

  it('persiste o cupom do checkout no carrinho da loja', async () => {
    renderCheckout({ initialStep: 'review', initialCouponCode: 'BEMVINDO10' });

    const coupon = screen.getByRole('textbox', { name: 'Cupom' });
    expect(coupon).toHaveValue('BEMVINDO10');
    fireEvent.change(coupon, { target: { value: 'NOVO10' } });

    await waitFor(() => expect(mocks.setCouponCode).toHaveBeenCalledWith('NOVO10'), {
      timeout: 1_000,
    });
  });

  it('restaura o cupom persistido na sacola ao abrir o checkout diretamente', async () => {
    cartState.couponCode = 'CART10';
    renderCheckout({ initialStep: 'review' });

    expect(await screen.findByRole('textbox', { name: 'Cupom' })).toHaveValue('CART10');
  });

  it('conclui retirada com Pix e registra telemetria antes de navegar', async () => {
    mocks.createOrderAction.mockResolvedValue({
      success: true,
      data: {
        publicToken: PUBLIC_TOKEN,
        orderNumber: 1,
        paymentReportToken: 'report-token-a',
      },
    });
    renderCheckout();

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Telefone / WhatsApp' }), {
      target: { value: '11999999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para recebimento' }));

    expect(await screen.findByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }));

    expect(await screen.findByRole('heading', { name: 'Como prefere pagar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar pedido' }));

    expect(await screen.findByRole('heading', { name: 'Revise antes de confirmar' })).toBeVisible();
    const confirm = screen.getByRole('button', { name: /Confirmar/ });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.createOrderAction).toHaveBeenCalledOnce(), {
      timeout: 5_000,
    });
    expect(mocks.clearCart).toHaveBeenCalledOnce();
    expect(mocks.reportCheckoutEvent).toHaveBeenCalledWith('loja-1', {
      event: 'checkout_completed',
      step: 'review',
    });
    expect(readPaymentReportToken(PUBLIC_TOKEN)).toBe('report-token-a');
    expect(window.sessionStorage.getItem(`payment-report:${PUBLIC_TOKEN}`)).toBeNull();
    expect(window.localStorage.getItem(`payment-report:${PUBLIC_TOKEN}`)).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith(`/loja-1/order/${PUBLIC_TOKEN}`);
  });

  it('assina a sincronização entre abas e remove o listener ao desmontar', () => {
    const { unmount } = renderCheckout();

    expect(mocks.subscribeToCartStorage).toHaveBeenCalledWith('store-1', 'loja-1');
    unmount();
    expect(mocks.storageCleanup).toHaveBeenCalledOnce();
  });

  it('explica todas as mudanças relevantes da cotação', () => {
    const removedLine = {
      ...quote.lines[0],
      lineId: 'removed-line',
      productId: 'removed-product',
      productName: 'Suco',
      quantity: 1,
      unitPrice: 800,
      itemTotal: 800,
    };
    const addedLine = {
      ...quote.lines[0],
      lineId: 'added-line',
      productId: 'added-product',
      productName: 'Batata',
      quantity: 1,
      unitPrice: 1_200,
      itemTotal: 1_200,
    };
    const previous = {
      ...quote,
      lines: [...quote.lines, removedLine],
      subtotal: 2_800,
      total: 3_300,
      coupon: { code: 'ANTIGO10', discount: 200 },
      discount: 200,
      issues: [
        {
          code: 'MIN_ORDER_NOT_REACHED' as const,
          message: 'Faltavam itens para o pedido mínimo.',
        },
      ],
      canCheckout: false,
    };
    const next = {
      ...quote,
      quoteFingerprint: 'b'.repeat(64),
      lines: [
        {
          ...quote.lines[0],
          productName: 'Produto artesanal',
          quantity: 2,
          options: [{ id: 'option-1', name: 'Bacon', price: 300 }],
          unitPrice: 2_300,
          itemTotal: 4_600,
          notes: 'Sem cebola',
        },
        addedLine,
      ],
      subtotal: 5_800,
      discount: 580,
      deliveryFee: 700,
      total: 5_920,
      deliveryZoneId: 'new-zone',
      deliveryZoneName: 'Zona Sul',
      estimatedMinMinutes: 45,
      estimatedMaxMinutes: 65,
      coupon: { code: 'NOVO10', discount: 580 },
      issues: [
        {
          code: 'PRODUCT_UNAVAILABLE' as const,
          message: 'Um adicional ficou indisponível.',
          lineId: cartItem.id,
        },
      ],
      canCheckout: false,
    };

    const changes = describeQuoteChanges(previous, next);

    expect(changes).toEqual(
      expect.arrayContaining([
        'Item removido: 1× Suco.',
        'Item adicionado: 1× Batata por R$ 12,00.',
        'Nome do item: “Produto” agora é “Produto artesanal”.',
        'Quantidade de Produto artesanal: 1 → 2.',
        'Adicionais de Produto artesanal: sem adicionais → Bacon (R$ 3,00).',
        'Preço unitário de Produto artesanal: R$ 20,00 → R$ 23,00.',
        'Total de Produto artesanal: R$ 20,00 → R$ 46,00.',
        'A observação de Produto artesanal foi atualizada.',
        'Região de entrega atualizada para Zona Sul.',
        'Prazo estimado atualizado para 45–65 min.',
        'Cupom alterado de ANTIGO10 para NOVO10.',
        'Resolvido: Faltavam itens para o pedido mínimo.',
        'Atenção: Um adicional ficou indisponível.',
      ]),
    );
  });

  it('nunca apresenta uma lista vazia quando apenas o fingerprint mudou', () => {
    expect(
      describeQuoteChanges(quote, {
        ...quote,
        quoteFingerprint: 'c'.repeat(64),
      }),
    ).toEqual(['A cotação foi recalculada. Confira os itens, condições e valores abaixo.']);
  });
});
