import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreHeaderVisibility } from '@/components/storefront/store-header-visibility';

const mocks = vi.hoisted(() => ({
  pathname: '/loja-demo',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

describe('StoreHeaderVisibility', () => {
  beforeEach(() => {
    mocks.pathname = '/loja-demo';
  });

  it.each(['/loja-demo/cart', '/loja-demo/checkout', '/cart', '/checkout'])(
    'oculta o cabeçalho em mobile na rota %s',
    (pathname) => {
      mocks.pathname = pathname;
      const { container } = render(
        <StoreHeaderVisibility>
          <header>Identidade da loja</header>
        </StoreHeaderVisibility>,
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(container.firstElementChild).toHaveClass('max-md:hidden');
    },
  );

  it('mantém o cabeçalho no cardápio e no acompanhamento do pedido', () => {
    mocks.pathname = '/loja-demo/order/pedido-1';
    const { container } = render(
      <StoreHeaderVisibility>
        <header>Identidade da loja</header>
      </StoreHeaderVisibility>,
    );

    expect(container.firstElementChild).not.toHaveClass('max-md:hidden');
  });
});
