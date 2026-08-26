import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  StorefrontAccountLoading,
  StorefrontCartLoading,
  StorefrontFavoritesLoading,
  StorefrontMoreLoading,
  StorefrontOrdersLoading,
} from '@/components/storefront/storefront-tab-loading';

afterEach(cleanup);

function expectAccessiblePreview(label: string) {
  const announcement = screen.getByText(label);
  const status = announcement.closest('[role="status"]');

  expect(status).not.toBeNull();
  expect(status?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  return status as HTMLElement;
}

describe('previews semânticos de loading do storefront', () => {
  it('representa itens e resumo da sacola', () => {
    render(<StorefrontCartLoading />);

    const status = expectAccessiblePreview('Preparando sua sacola…');
    expect(status).toHaveTextContent('Sua sacola');
    expect(status).toHaveTextContent('Subtotal');
    expect(status).toHaveTextContent('Total');
    expect(status.querySelector('[data-loading-layout="cart-items"]')?.children).toHaveLength(3);
  });

  it('representa pedidos em andamento e anteriores', () => {
    render(<StorefrontOrdersLoading />);

    const status = expectAccessiblePreview('Atualizando seus pedidos…');
    expect(status).toHaveTextContent('Meus pedidos');
    expect(status).toHaveTextContent('Em andamento');
    expect(status).toHaveTextContent('Pedidos anteriores');
    expect(status.querySelectorAll('[data-loading-item="order"]')).toHaveLength(3);
  });

  it('mantém a hierarquia real de Mais', () => {
    render(<StorefrontMoreLoading />);

    const status = expectAccessiblePreview('Carregando atalhos da loja…');
    expect(status).toHaveTextContent('Mais');
    expect(status).toHaveTextContent('Para você');
    expect(status).toHaveTextContent('A loja');
    expect(status.querySelector('[data-loading-layout="more-personal"]')?.children).toHaveLength(3);
    expect(status.querySelector('[data-loading-layout="more-store"]')?.children).toHaveLength(2);
  });

  it('representa favoritos como grid de produtos', () => {
    render(<StorefrontFavoritesLoading />);

    const status = expectAccessiblePreview('Carregando seus favoritos…');
    expect(status).toHaveTextContent('Favoritos');
    expect(status.querySelector('[data-loading-layout="favorites-grid"]')?.children).toHaveLength(
      4,
    );
  });

  it('representa identificação, ações e aparelhos da conta', () => {
    render(<StorefrontAccountLoading />);

    const status = expectAccessiblePreview('Carregando sua conta…');
    expect(status).toHaveTextContent('Minha conta');
    expect(status).toHaveTextContent('Acesse seus pedidos, endereços e aparelhos conectados.');
    expect(status.querySelector('[data-loading-layout="account"]')).not.toBeNull();
  });
});
