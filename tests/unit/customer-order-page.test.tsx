import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrderByPublicToken: vi.fn(),
  isPublicOrderTokenExpired: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/server/repositories/order.repository', () => ({
  getOrderByPublicToken: mocks.getOrderByPublicToken,
  isPublicOrderTokenExpired: mocks.isPublicOrderTokenExpired,
}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('@/server/queries/public-store', () => ({
  getCanonicalPublicStoreSlug: vi.fn(),
}));
vi.mock('@/lib/pusher/customer-channel', () => ({
  privateCustomerOrderChannel: vi.fn(),
}));

import OrderPage from '@/app/[storeSlug]/order/[token]/page';

describe('página pública de acompanhamento', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('exibe uma página genérica e sem dados do pedido quando o token expirou', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    mocks.getOrderByPublicToken.mockResolvedValue(null);
    mocks.isPublicOrderTokenExpired.mockResolvedValue(true);

    const page = await OrderPage({
      params: Promise.resolve({
        storeSlug: 'burger-do-ze',
        token: '4da03571-bffd-45ef-8c44-20686c487838',
      }),
    });
    render(page);

    expect(
      screen.getByRole('heading', { name: 'Acompanhamento indisponível' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao cardápio' })).toHaveAttribute(
      'href',
      '/burger-do-ze',
    );
    expect(screen.queryByText(/Pedido #/i)).not.toBeInTheDocument();
    expect(mocks.isPublicOrderTokenExpired).toHaveBeenCalledWith(
      '4da03571-bffd-45ef-8c44-20686c487838',
      'burger-do-ze',
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
