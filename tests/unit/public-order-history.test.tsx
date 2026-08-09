import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicOrderHistory } from '@/components/storefront/public-order-history';
import {
  usePublicOrderHistoryStore,
  writePublicOrderHistory,
} from '@/stores/public-order-history-store';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const TRACKING_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

const trackingState = {
  orderNumber: 42,
  modality: 'PICKUP' as const,
  status: 'PREPARING' as const,
  paymentStatus: 'PENDING' as const,
  version: 2,
  statusChangedAt: '2026-08-01T12:10:00.000Z',
  updatedAt: '2026-08-01T12:10:00.000Z',
  estimate: null,
  cancellationMessage: null,
};

describe('PublicOrderHistory', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    vi.stubGlobal('fetch', fetchMock);
    usePublicOrderHistoryStore.setState({ storeId: null, storeSlug: null, orders: [] });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ orders: [trackingState] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra pedidos lembrados somente depois de validar o token', async () => {
    writePublicOrderHistory(window.localStorage, 'store-a', 'loja-a', [
      {
        trackingToken: TRACKING_TOKEN,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<PublicOrderHistory storeId="store-a" storeSlug="loja-a" />);

    expect(await screen.findByRole('heading', { name: 'Seus pedidos' })).toBeVisible();
    expect(screen.getByText('Pedido #42')).toBeVisible();
    expect(screen.getByText(/Em preparo/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Acompanhar pedido 42' })).toHaveAttribute(
      'href',
      `/loja-a/order/${TRACKING_TOKEN}`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/orders/history',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    );
  });

  it('remove tokens expirados e informa que não há pedido disponível', async () => {
    writePublicOrderHistory(window.localStorage, 'store-a', 'loja-a', [
      {
        trackingToken: TRACKING_TOKEN,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: new Date().toISOString(),
      },
    ]);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ orders: [null] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<PublicOrderHistory storeId="store-a" storeSlug="loja-a" />);

    await waitFor(() => expect(usePublicOrderHistoryStore.getState().orders).toEqual([]));
    expect(screen.queryByText('Pedido #42')).not.toBeInTheDocument();
  });

  it('mostra o estado vazio quando não há histórico opt-in', () => {
    render(<PublicOrderHistory storeId="store-a" storeSlug="loja-a" />);

    expect(
      screen.getByRole('heading', { name: 'Nenhum pedido por aqui ainda' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permite limpar o histórico e anuncia a remoção', async () => {
    writePublicOrderHistory(window.localStorage, 'store-a', 'loja-a', [
      {
        trackingToken: TRACKING_TOKEN,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<PublicOrderHistory storeId="store-a" storeSlug="loja-a" />);

    await screen.findByRole('heading', { name: 'Seus pedidos' });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pedidos lembrados' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Pedidos lembrados removidos deste aparelho.',
      ),
    );
  });

  it('permite pedir novamente um pedido concluído e redireciona para a vitrine', async () => {
    writePublicOrderHistory(window.localStorage, 'store-a', 'loja-a', [
      {
        trackingToken: TRACKING_TOKEN,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: new Date().toISOString(),
      },
    ]);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ orders: [{ ...trackingState, status: 'DELIVERED' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            readyItems: [
              {
                productId: 'prod-1',
                productName: 'X-Salada',
                basePrice: 2500,
                unitPrice: 2500,
                quantity: 2,
                notes: '',
                imageUrl: null,
                imageAssetId: null,
                selectedOptions: [],
                priceChanged: false,
              },
            ],
            issues: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    render(<PublicOrderHistory storeId="store-a" storeSlug="loja-a" />);

    const reorderButton = await screen.findByRole('button', {
      name: /Pedir novamente o pedido 42/i,
    });
    fireEvent.click(reorderButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/loja-a/cart'));
  });
});
