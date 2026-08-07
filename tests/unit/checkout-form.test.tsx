import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutForm, describeQuoteChanges } from '@/components/storefront/checkout-form';
import { writeCheckoutDraft } from '@/lib/checkout/checkout-draft';
import {
  clearPaymentReportToken,
  readPaymentReportToken,
} from '@/lib/orders/payment-report-token-memory';
import { getCartStorageKey, useCartStore, type CartItem } from '@/stores/cart-store';
import { readPublicOrderHistory, usePublicOrderHistoryStore } from '@/stores/public-order-history-store';
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
  useRouter: () => ({ push: mocks.push }),
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

function renderCheckout(
  overrides: Partial<React.ComponentProps<typeof CheckoutForm>> = {},
  strictMode = false,
) {
  const element = (
    <CheckoutForm
      storeId="store-1"
      storeSlug="loja-1"
      minOrderValue={0}
      deliveryEnabled={false}
      pickupEnabled
      acceptsPix
      acceptsCash={false}
      acceptsCardOnDelivery={false}
      deliveryZones={[
        {
          id: quote.deliveryZoneId!,
          name: 'Centro',
          fee: 500,
          estimatedTime: '30-50 min',
          minOrderValue: 0,
        },
      ]}
      storeCity="São Paulo"
      storeState="SP"
      {...overrides}
    />
  );
  return render(strictMode ? <StrictMode>{element}</StrictMode> : element);
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
    usePublicOrderHistoryStore.setState({ storeId: null, storeSlug: null, orders: [] });
    usePublicOrderHistoryStore.setState({ storeId: null, storeSlug: null, orders: [] });
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

    const phone = screen.getByRole('textbox', { name: 'Celular' });
    fireEvent.change(phone, { target: { value: '+55 11 99999-9999' } });

    expect(phone).toHaveValue('(11) 99999-9999');
    expect(mocks.setStore).toHaveBeenCalledWith('store-1', 'loja-1');
    expect(mocks.reportCheckoutEvent).toHaveBeenCalledWith('loja-1', {
      event: 'checkout_started',
      step: 'identification',
    });
  });

  it('consulta o aparelho uma vez e só envia nome/telefone ao tocar em Continuar', async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/checkout/recognition')) {
        return {
          ok: true,
          json: async () => ({
            recognized: false,
            message:
              'Não foi possível recuperar dados salvos. Você pode continuar preenchendo o checkout normalmente.',
          }),
        };
      }
      return { ok: true, json: async () => quote };
    });
    renderCheckout();

    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });

    expect(
      mocks.fetch.mock.calls.filter(([input]) => String(input).endsWith('/checkout/recognition')),
    ).toHaveLength(1);
    expect(
      mocks.fetch.mock.calls.find(([input]) => String(input).endsWith('/checkout/recognition'))?.[1]
        ?.method,
    ).toBe('GET');

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await screen.findByRole('heading', { name: 'Como quer receber?' });
    expect(
      mocks.fetch.mock.calls.filter(([input]) => String(input).endsWith('/checkout/recognition')),
    ).toHaveLength(2);
    expect(
      mocks.fetch.mock.calls.some(
        ([input, request]) =>
          String(input).endsWith('/checkout/recognition') && request?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('abre automaticamente o diálogo quando o aparelho é reconhecido sem preencher PII', async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/checkout/recognition') && init?.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            recognized: true,
            maskedName: 'João M***',
            maskedPhone: '(11) *****-**99',
            maskedAddresses: [
              {
                opaqueReference: 'D'.repeat(43),
                label: 'Casa',
                maskedAddress: 'Rua das F***, nº *** — Centro',
                isDefault: true,
                requiresDeliveryZoneSelection: false,
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => quote };
    });

    renderCheckout({ deliveryEnabled: true, initialModality: 'DELIVERY' }, true);

    expect(await screen.findByRole('dialog', undefined, { timeout: 5_000 })).toBeVisible();
    expect(
      mocks.fetch.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/checkout/recognition') && init?.method === 'GET',
      ),
    ).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Celular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('João Martins');
    expect(document.body.textContent).not.toContain('11999999999');

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Continuar como João M/ })).toBeVisible();
  });

  it('consome o reconhecimento iniciado pelo loader sem repetir a consulta automatica', async () => {
    const request = Promise.resolve({
      recognized: true,
      maskedName: 'Joao M***',
      maskedPhone: '(11) *****-**99',
      maskedAddresses: [
        {
          opaqueReference: 'D'.repeat(43),
          label: 'Casa',
          maskedAddress: 'Rua das F***, numero *** - Centro',
          isDefault: true,
          requiresDeliveryZoneSelection: false,
        },
      ],
    });

    renderCheckout(
      {
        deliveryEnabled: true,
        initialModality: 'DELIVERY',
        automaticRecognitionManaged: true,
        automaticRecognitionBootstrap: { storeSlug: 'loja-1', request },
      },
      true,
    );

    expect(await screen.findByRole('dialog', undefined, { timeout: 5_000 })).toBeVisible();
    expect(
      mocks.fetch.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/checkout/recognition') && init?.method === 'GET',
      ),
    ).toHaveLength(0);
  });

  it('mostra somente o endereço mascarado e usa a referência após confirmação', async () => {
    const opaqueReference = 'A'.repeat(43);
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/checkout/recognition') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            recognized: true,
            maskedName: 'João M***',
            maskedPhone: '(11) *****-**99',
            maskedAddresses: [
              {
                opaqueReference,
                label: 'Casa',
                maskedAddress: 'Rua das F***, nº *** — Centro',
                isDefault: true,
                lastUsedLabel: 'Usado recentemente',
                requiresDeliveryZoneSelection: false,
              },
            ],
          }),
        };
      }
      if (url.endsWith('/checkout/recognition') && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            confirmed: true,
            mode: 'SAVED_ADDRESS',
            opaqueReference,
          }),
        };
      }
      return { ok: true, json: async () => quote };
    });
    renderCheckout({ deliveryEnabled: true, initialModality: 'DELIVERY' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'João Martins' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Rua das F***, nº *** — Centro')).toBeVisible();
    expect(screen.queryByText(/182/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Casa/ })).not.toHaveAttribute(
      'value',
      opaqueReference,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sim, continuar' }));

    await screen.findByRole('heading', { name: 'Como quer receber?' });
    expect(screen.getByText('Rua das F***, nº *** — Centro')).toBeVisible();
    const patchCall = mocks.fetch.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/checkout/recognition') && init?.method === 'PATCH',
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      action: 'CONFIRM_ADDRESS',
      opaqueReference,
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar para pagamento/ }));
    expect(await screen.findByRole('heading', { name: 'Como prefere pagar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Revisar pedido/ }));
    expect(await screen.findByRole('heading', { name: 'Revise antes de confirmar' })).toBeVisible();

    const confirm = screen.getByRole('button', { name: /Confirmar/ });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.createOrderAction).toHaveBeenCalledOnce(), {
      timeout: 5_000,
    });
    const submittedPayload = mocks.createOrderAction.mock.calls[0]?.[1];
    expect(submittedPayload).toMatchObject({
      identityMode: 'RECOGNIZED',
      savedAddressReference: opaqueReference,
    });
    expect(submittedPayload).not.toHaveProperty('customerName');
    expect(submittedPayload).not.toHaveProperty('customerPhone');
    expect(submittedPayload.deliveryAddress).toBeUndefined();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Vamos identificar você' }),
    ).not.toBeInTheDocument();
  });

  it('não abre uma sheet vazia e confirma o modo de novo endereço', async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/checkout/recognition') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            recognized: true,
            maskedName: 'Ana S***',
            maskedPhone: '(11) *****-**00',
            maskedAddresses: [],
          }),
        };
      }
      if (url.endsWith('/checkout/recognition') && init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ confirmed: true, mode: 'NEW_ADDRESS' }),
        };
      }
      return { ok: true, json: async () => quote };
    });
    renderCheckout();
    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Ana Silva' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await screen.findByRole('heading', { name: 'Como quer receber?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      mocks.fetch.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/checkout/recognition') &&
          init?.method === 'PATCH' &&
          String(init.body).includes('USE_NEW_ADDRESS'),
      ),
    ).toBe(true);
  });

  it('Escape e overlay fecham sem confirmar e devolvem o foco ao Continuar', async () => {
    const opaqueReference = 'B'.repeat(43);
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/checkout/recognition') && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            recognized: true,
            maskedName: 'João M***',
            maskedPhone: '(11) *****-**99',
            maskedAddresses: [
              {
                opaqueReference,
                label: 'Casa',
                maskedAddress: 'Rua das F***, nº *** — Centro',
                isDefault: true,
                requiresDeliveryZoneSelection: false,
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => quote };
    });
    renderCheckout();
    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'João Martins' },
    });
    const continueButton = screen.getByRole('button', { name: /Continuar/ });

    fireEvent.click(continueButton);
    expect(await screen.findByRole('dialog')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const reopenButton = screen.getByRole('button', { name: /Continuar como João M/ });
    await waitFor(() => expect(reopenButton).toHaveFocus());

    fireEvent.click(reopenButton);
    expect(await screen.findByRole('dialog')).toBeVisible();
    fireEvent.pointerDown(document.querySelector('.customer-recognition-overlay')!);
    fireEvent.click(document.querySelector('.customer-recognition-overlay')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(
      mocks.fetch.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/checkout/recognition') && init?.method === 'PATCH',
      ),
    ).toBe(false);
    expect(screen.getByRole('heading', { name: 'Vamos identificar você' })).toBeVisible();
  });

  it('restaura a zona, mas não ressuscita cupom removido de um rascunho antigo', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
      deliveryZoneId: quote.deliveryZoneId!,
      couponCode: 'BEMVINDO10',
    });
    renderCheckout({
      deliveryEnabled: true,
      initialStep: 'fulfillment',
      initialModality: 'DELIVERY',
    });

    expect(screen.getByRole('button', { name: 'Entrega' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Bairro ou região atendida' })).toHaveValue(
      quote.deliveryZoneId,
    );
    expect(screen.getByRole('textbox', { name: /CEP/ })).toHaveValue('');
    await waitFor(() => expect(mocks.setCouponCode).toHaveBeenCalledWith(''));
    expect(mocks.setCouponCode).not.toHaveBeenCalledWith('BEMVINDO10');
  });

  it('não expõe região ou dados pessoais na URL ao avançar', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
      deliveryZoneId: quote.deliveryZoneId!,
    });
    renderCheckout({
      deliveryEnabled: true,
      initialModality: 'DELIVERY',
    });
    await waitFor(() => expect(mocks.setStore).toHaveBeenCalledWith('store-1', 'loja-1'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    await screen.findByRole('heading', { name: 'Como quer receber?' });
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/loja-1/checkout?step=fulfillment&modality=DELIVERY',
    );
    expect(replaceState.mock.calls.flat().join(' ')).not.toContain('postalCode');
    expect(replaceState.mock.calls.flat().join(' ')).not.toContain('deliveryZoneId');
    expect(replaceState.mock.calls.flat().join(' ')).not.toContain('Cliente');
  });

  it('solicita a região antes de mostrar e validar o novo endereço', async () => {
    writeCheckoutDraft(window.sessionStorage, 'store-1', {
      modality: 'DELIVERY',
      paymentMethod: 'PIX',
    });
    renderCheckout({
      deliveryEnabled: true,
      initialStep: 'fulfillment',
      initialModality: 'DELIVERY',
    });

    expect(screen.queryByRole('textbox', { name: 'Rua' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Bairro ou região atendida' }), {
      target: { value: quote.deliveryZoneId },
    });
    expect(await screen.findByRole('textbox', { name: 'Rua' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Continuar para pagamento/ }));

    expect(await screen.findByText('Informe a rua.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
  });

  it('preserva o erro técnico da cotação sem acusar incorretamente a região', async () => {
    const technicalMessage =
      'Não foi possível validar a cotação agora. Aguarde um instante e tente novamente.';
    mocks.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'RATE_LIMITED', message: technicalMessage }),
    });
    renderCheckout({
      deliveryEnabled: true,
      initialStep: 'fulfillment',
      initialModality: 'DELIVERY',
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Bairro ou região atendida' }), {
      target: { value: quote.deliveryZoneId },
    });
    expect(await screen.findByText(technicalMessage)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Continuar para pagamento/ }));

    await waitFor(() => expect(screen.getAllByText(technicalMessage).length).toBeGreaterThan(0));
    expect(
      screen.queryByText(
        'Não conseguimos confirmar a entrega para essa região. Escolha outra região ou fale com a loja.',
      ),
    ).not.toBeInTheDocument();
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
        modality: 'DELIVERY',
        paymentMethod: 'PIX',
        deliveryZoneId: quote.deliveryZoneId!,
      });
      const { container } = renderCheckout({
        deliveryEnabled: true,
        initialModality: 'DELIVERY',
      });

      fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
        target: { value: 'Cliente Teste' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
        target: { value: '11999999999' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

      const street = await screen.findByRole('textbox', { name: 'Rua' }, { timeout: 5_000 });
      fireEvent.change(street, { target: { value: 'Rua das Flores' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Número' }), {
        target: { value: '10' },
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

  it('mantém o cupom validado somente como desconto na revisão', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...quote,
        discount: 200,
        total: 2_300,
        coupon: { code: 'BEMVINDO10', discount: 200 },
      }),
    });
    renderCheckout({ initialStep: 'review', initialCouponCode: 'BEMVINDO10' });

    expect(
      screen.getByRole('checkbox', { name: 'Salvar meus dados para a próxima compra' }),
    ).toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Cupom' })).not.toBeInTheDocument();
    expect((await screen.findAllByText('Desconto BEMVINDO10')).length).toBeGreaterThan(0);
    await waitFor(() => expect(mocks.setCouponCode).toHaveBeenCalledWith('BEMVINDO10'), {
      timeout: 1_000,
    });
  });

  it('usa o cupom persistido na sacola sem reabrir um campo de edição', async () => {
    cartState.couponCode = 'CART10';
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...quote,
        discount: 150,
        total: 2_350,
        coupon: { code: 'CART10', discount: 150 },
      }),
    });
    renderCheckout({ initialStep: 'review' });

    expect((await screen.findAllByText('Desconto CART10')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('textbox', { name: 'Cupom' })).not.toBeInTheDocument();
  });

  it('direciona um cupom inválido para correção na sacola sem mostrá-lo como aplicado', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...quote,
        canCheckout: false,
        coupon: null,
        issues: [
          {
            code: 'COUPON_INVALID',
            message: 'Este cupom não está disponível para este pedido.',
          },
        ],
      }),
    });
    renderCheckout({ initialStep: 'review', initialCouponCode: 'INVALIDO' });

    const correction = await screen.findByRole('link', { name: 'Corrigir na sacola' });
    expect(correction).toHaveAttribute('href', '/loja-1/cart');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Este cupom não está disponível para este pedido.',
    );
    expect(screen.queryByRole('textbox', { name: 'Cupom' })).not.toBeInTheDocument();
    expect(screen.queryByText('Desconto INVALIDO')).not.toBeInTheDocument();
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
    const { container } = renderCheckout();

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Cliente Teste' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Celular' }), {
      target: { value: '11999999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Continuar para pagamento/ }));

    expect(await screen.findByRole('heading', { name: 'Como prefere pagar?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Revisar pedido/ }));

    expect(await screen.findByRole('heading', { name: 'Revise antes de confirmar' })).toBeVisible();
    const confirm = screen.getByRole('button', { name: /Confirmar/ });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.createOrderAction).not.toHaveBeenCalled();

    fireEvent.submit(container.querySelector('form')!);
    expect(mocks.createOrderAction).not.toHaveBeenCalled();

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
    expect(readPublicOrderHistory(window.localStorage, 'store-1', 'loja-1')).toHaveLength(1);
    expect(window.sessionStorage.getItem(`payment-report:${PUBLIC_TOKEN}`)).toBeNull();
    expect(window.localStorage.getItem(`payment-report:${PUBLIC_TOKEN}`)).toBeNull();
    
    // Verifica a mensagem de sucesso (ponte)
    expect(screen.getByText(/Pedido #1 confirmado/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => 
      expect(mocks.push).toHaveBeenCalledWith(`/loja-1/order/${PUBLIC_TOKEN}`)
    );
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
          options: [
            {
              id: 'option-1',
              name: 'Bacon',
              price: 300,
              position: 0,
              groupId: 'group-1',
              groupName: 'Adicionais',
              groupPosition: 0,
            },
          ],
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
