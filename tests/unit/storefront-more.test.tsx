import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorefrontFavorites } from '@/components/storefront/storefront-favorites';
import { StorefrontMore } from '@/components/storefront/storefront-more';
import { createDefaultCustomization } from '@/features/customization/domain/defaults';
import { useFavoritesStore, writeFavorites } from '@/stores/favorites-store';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  share: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const storeInfo = {
  name: 'Sabor da Vila',
  description: 'Comida brasileira feita com cuidado.',
  slogan: null,
  aboutText: null,
  logoUrl: null,
  logoAssetId: null,
  availability: {
    acceptingOrders: true,
    state: 'OPEN' as const,
    reason: 'Aberta agora.',
    nextTransitionAt: null,
  },
  estimatedTime: 'Pronto em 30–45 min',
  minOrderValue: 2_500,
  deliveryEnabled: true,
  pickupEnabled: true,
  minDeliveryFee: 500,
  openingHours: [{ dayOfWeek: 'MONDAY', openTime: '11:00', closeTime: '22:00' }],
  address: {
    street: 'Rua das Flores',
    number: '123',
    complement: null,
    neighborhood: 'Centro',
    city: 'Fortaleza',
    state: 'CE',
    zipCode: '60000000',
  },
  acceptsPix: true,
  acceptsCash: true,
  acceptsCardOnDelivery: true,
  phone: null,
  whatsapp: null,
  shareUrl: 'https://pedido.local/sabor-da-vila',
};

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

function resetFavoritesStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
  useFavoritesStore.setState({ storeId: null, productIds: [] });
}

function renderMore(hasVerifiedConsumer = false, offerCount = 0) {
  return render(
    <div className="storefront-theme">
      <StorefrontMore
        storeId="store-a"
        storeSlug="sabor-da-vila"
        storeName="Sabor da Vila"
        logoUrl={null}
        logoAssetId={null}
        offerCount={offerCount}
        hasVerifiedConsumer={hasVerifiedConsumer}
        storeInfo={storeInfo}
      />
    </div>,
  );
}

describe('hub Mais do storefront', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFavoritesStorage();
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: mocks.share,
    });
    mocks.share.mockResolvedValue(undefined);
  });

  it('mostra os atalhos públicos ao guest sem expor Seus dados', async () => {
    renderMore(false);

    expect(screen.getByRole('heading', { name: 'Mais' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Favoritos/ })).toHaveAttribute(
      'href',
      '/sabor-da-vila/favorites',
    );
    expect(screen.getByRole('link', { name: /Ofertas e cupons/ })).toHaveAttribute(
      'href',
      '/sabor-da-vila',
    );
    expect(screen.getByText('Fidelidade').closest('a, button')).toBeNull();
    expect(screen.getByText('Fidelidade').closest('[aria-disabled="true"]')).toBeVisible();
    expect(screen.getByRole('button', { name: /Sobre a loja/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Compartilhar loja Sabor da Vila' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Seus dados' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Favoritos, nenhum produto salvo' })).toBeVisible(),
    );
  });

  it('mostra Meus endereços somente para consumidor verificado', () => {
    renderMore(true);

    expect(screen.getByRole('heading', { name: 'Seus dados' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Meus endereços/ })).toHaveAttribute(
      'href',
      '/sabor-da-vila/account/addresses',
    );
  });

  it.each([1, 10])('mostra a contagem real de %i favorito(s) da loja', async (count) => {
    writeFavorites(
      window.localStorage,
      'store-a',
      Array.from({ length: count }, (_, index) => `product-${index + 1}`),
    );

    renderMore();

    expect(
      await screen.findByRole('link', {
        name: `Favoritos, ${count} ${count === 1 ? 'produto salvo' : 'produtos salvos'}`,
      }),
    ).toBeVisible();
    expect(screen.getByText(String(count))).toBeVisible();
  });

  it('não mistura favoritos de outra loja nem mostra badge zero', async () => {
    writeFavorites(window.localStorage, 'store-b', ['product-b']);
    renderMore();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Favoritos, nenhum produto salvo' })).toBeVisible(),
    );
    expect(document.querySelector('.storefront-more-count')).toBeNull();
  });

  it('mostra somente contagem de ofertas recebida da consulta pública', () => {
    renderMore(false, 2);

    expect(
      screen.getByRole('link', { name: 'Ofertas e cupons, 2 ofertas disponíveis' }),
    ).toHaveAttribute('href', '/sabor-da-vila#ofertas');
    expect(screen.getByText('2')).toBeVisible();
  });

  it('reutiliza o StoreInfoSheet e devolve foco ao fechar', async () => {
    renderMore();

    const trigger = screen.getByRole('button', { name: /Sobre a loja/ });
    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sobre a loja' })).toBeVisible();
    expect(screen.getByText('Rua das Flores, 123')).toBeVisible();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('reutiliza o compartilhamento com a URL canônica da loja', async () => {
    renderMore();

    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar loja Sabor da Vila' }));

    await waitFor(() =>
      expect(mocks.share).toHaveBeenCalledWith({
        title: 'Sabor da Vila',
        text: 'Confira o cardápio de Sabor da Vila',
        url: 'https://pedido.local/sabor-da-vila',
      }),
    );
  });
});

describe('favoritos do storefront', () => {
  beforeEach(() => {
    resetFavoritesStorage();
  });

  it('mostra o estado vazio com retorno ao cardápio', async () => {
    render(
      <StorefrontFavorites
        storeId="store-a"
        storeSlug="sabor-da-vila"
        categories={[]}
        customization={createDefaultCustomization()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Nenhum favorito ainda' })).toBeVisible();
    expect(screen.getByText(/Use o coração no cardápio/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver cardápio' })).toHaveAttribute(
      'href',
      '/sabor-da-vila',
    );
  });

  it('ignora produto removido sem quebrar a página', async () => {
    writeFavorites(window.localStorage, 'store-a', ['product-removed']);
    render(
      <StorefrontFavorites
        storeId="store-a"
        storeSlug="sabor-da-vila"
        categories={[]}
        customization={createDefaultCustomization()}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nenhum favorito disponível agora' }),
    ).toBeVisible();
  });
});
