import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearOrder: vi.fn(),
  fetch: vi.fn(),
  privateCustomerOrderChannel: vi.fn(),
  setStore: vi.fn(),
  useTracking: vi.fn(),
  lastOrder: {
    version: 1,
    trackingToken: '4da03571-bffd-45ef-8c44-20686c487838',
    storeId: 'store-1',
    storeSlug: 'loja-1',
    createdAt: '2026-07-22T12:00:00.000Z',
  } as const,
}));

vi.mock('@/stores/last-order-store', () => ({
  useLastOrderStore: (selector: (state: unknown) => unknown) =>
    selector({
      record: mocks.lastOrder,
      setStore: mocks.setStore,
      clearOrder: mocks.clearOrder,
    }),
}));
vi.mock('@/hooks/use-customer-order-tracking', () => ({
  useCustomerOrderTracking: mocks.useTracking,
}));
vi.mock('@/lib/pusher/customer-channel', () => ({
  privateCustomerOrderChannel: mocks.privateCustomerOrderChannel,
}));

import { ActiveOrderBanner } from '@/components/storefront/active-order-banner';

const trackingState = {
  orderNumber: 42,
  modality: 'PICKUP' as const,
  status: 'PREPARING' as const,
  paymentStatus: 'PENDING' as const,
  version: 3,
  statusChangedAt: '2026-07-22T18:05:00.000Z',
  updatedAt: '2026-07-22T18:06:00.000Z',
  estimate: {
    label: 'Previsão para retirada',
    minAt: '2026-07-22T18:30:00.000Z',
    maxAt: '2026-07-22T18:50:00.000Z',
  },
  cancellationMessage: null,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ActiveOrderBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue(response(trackingState));
    mocks.privateCustomerOrderChannel.mockResolvedValue('private-order-channel');
    mocks.useTracking.mockReturnValue({
      state: trackingState,
      connection: 'connected',
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra o pedido em andamento da mesma loja e leva ao acompanhamento', async () => {
    render(<ActiveOrderBanner storeId="store-1" storeSlug="loja-1" />);

    await waitFor(() => expect(screen.getByText('Pedido #42')).toBeVisible());
    expect(screen.getByText('Em preparo')).toBeVisible();
    expect(screen.getByText(/15:30–15:50/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Acompanhar pedido 42' })).toHaveAttribute(
      'href',
      '/loja-1/order/4da03571-bffd-45ef-8c44-20686c487838',
    );
    expect(screen.getByRole('link', { name: 'Acompanhar pedido 42' })).toHaveClass(
      'storefront-active-order-link',
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/orders/track/4da03571-bffd-45ef-8c44-20686c487838?storeSlug=loja-1',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('não consulta nem exibe pedido salvo de outra loja', async () => {
    render(<ActiveOrderBanner storeId="store-2" storeSlug="outra-loja" />);

    await waitFor(() => expect(mocks.setStore).toHaveBeenCalledWith('store-2', 'outra-loja'));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('limpa o pedido salvo quando o token não está mais disponível', async () => {
    mocks.fetch.mockResolvedValue(response({ code: 'TOKEN_EXPIRED' }, 410));

    render(<ActiveOrderBanner storeId="store-1" storeSlug="loja-1" />);

    await waitFor(() => expect(mocks.clearOrder).toHaveBeenCalledOnce());
    expect(screen.queryByText('Pedido #42')).not.toBeInTheDocument();
  });
});
