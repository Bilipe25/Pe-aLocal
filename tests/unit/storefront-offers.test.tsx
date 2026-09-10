import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComboConfigurator,
  FlexibleComboConfigurator,
  StorefrontOffers,
} from '@/components/storefront/storefront-offers';
import { ProductCard } from '@/components/storefront/product-card';
import { useCartStore } from '@/stores/cart-store';
import { fixedOffer, flexibleOffer } from '../fixtures/storefront-offers';

describe('ofertas do cardápio', () => {
  beforeEach(() => {
    useCartStore.setState({ storeId: 'store', storeSlug: 'burger-do-ze', items: [], revision: 1 });
  });

  it('mostra no máximo seis destaques e permite consultar todas as ofertas', () => {
    const offers = Array.from({ length: 8 }, (_, index) => ({
      ...fixedOffer,
      id: `combo-${index}`,
      name: `Combo ${index}`,
    }));
    render(<StorefrontOffers offers={offers} storeOpen onProductClick={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas (8)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByRole('list')).toHaveClass('is-expanded');
    expect(screen.getByRole('button', { name: 'Ver destaques' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver destaques' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('respeita a configuração sem fotos e usa a descrição do lojista', () => {
    const { container } = render(
      <StorefrontOffers
        offers={[fixedOffer]}
        storeOpen
        showImages={false}
        onProductClick={vi.fn()}
      />,
    );
    expect(container.querySelector('.storefront-product-image-frame')).toBeNull();
    expect(screen.getByText('Seu lanche com bebida.')).toBeVisible();
  });

  it('usa um contêiner de imagem dimensionado e oferece fallback quando a imagem falha', () => {
    const { container } = render(
      <StorefrontOffers
        offers={[{ ...fixedOffer, imageUrl: '/combo.jpg' }]}
        storeOpen
        onProductClick={vi.fn()}
      />,
    );
    expect(
      container.querySelector('.storefront-offer-media > .storefront-product-image-frame'),
    ).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('Imagem indisponível')).toBeVisible();
  });

  it('filtra por nome de componente sem acentos e esconde ofertas não relacionadas', () => {
    const { rerender } = render(
      <StorefrontOffers
        offers={[fixedOffer]}
        search="classico"
        storeOpen
        onProductClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Combo XIS' })).toBeVisible();
    rerender(
      <StorefrontOffers offers={[fixedOffer]} search="pizza" storeOpen onProductClick={vi.fn()} />,
    );
    expect(screen.queryByRole('region', { name: 'Ofertas' })).not.toBeInTheDocument();
  });

  it('não promete economia fixa para um combo com escolhas de preço variável', () => {
    render(<StorefrontOffers offers={[flexibleOffer]} storeOpen onProductClick={vi.fn()} />);
    expect(screen.getByText('A partir de')).toBeVisible();
    expect(screen.queryByText(/Economize/)).not.toBeInTheDocument();
    expect(screen.queryByText('Preço anterior:')).not.toBeInTheDocument();
  });

  it.each(['fixo', 'flexível'])(
    'mantém opções no scroll e compra fora dele no combo %s',
    (kind) => {
      const { container } = render(
        kind === 'fixo' ? (
          <ComboConfigurator offer={fixedOffer} storeOpen onClose={vi.fn()} />
        ) : (
          <FlexibleComboConfigurator offer={flexibleOffer} storeOpen onClose={vi.fn()} />
        ),
      );
      const dialog = screen.getByRole('dialog');
      const scroll = dialog.querySelector('.storefront-product-modal-scroll')!;
      expect(scroll.querySelector('.storefront-product-modal-options')).not.toBeNull();
      const add = within(dialog).getByRole('button', { name: /Adicionar/ });
      expect(scroll.contains(add)).toBe(false);
      expect(add).toHaveClass('storefront-product-modal-cta');
      expect(within(dialog).getByRole('group', { name: 'Quantidade de combos' })).toHaveClass(
        'storefront-product-quantity',
      );
      expect(container.querySelector('.storefront-product-modal-purchase-row')).toBeNull();
      expect(within(dialog).getByRole('textbox')).toHaveAttribute('maxlength', '500');
      expect(add).toBeDisabled();
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Bem passado' }));
      fireEvent.click(within(dialog).getByRole('checkbox', { name: /Bacon extra/ }));
      expect(add).toBeEnabled();
      expect(add).toHaveTextContent(/23,00/);
      fireEvent.click(add);
      expect(useCartStore.getState().items[0]).toMatchObject({ kind: 'COMBO', unitPrice: 2300 });
    },
  );

  it('começa pela escolha de menor preço no combo flexível', () => {
    render(<FlexibleComboConfigurator offer={flexibleOffer} storeOpen onClose={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'X-Burguer Clássico' })).toBeChecked();
    expect(screen.getByRole('button', { name: /Adicionar/ })).toHaveTextContent(/20,00/);
  });

  it('permite consultar mas não comprar enquanto a loja está fechada', () => {
    render(<ComboConfigurator offer={fixedOffer} storeOpen={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Bem passado' }));
    expect(screen.getByText('A loja está fechada agora.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Adicionar/ })).toBeDisabled();
  });

  it('devolve o foco à oferta depois de fechar a configuração', async () => {
    render(<StorefrontOffers offers={[fixedOffer]} storeOpen onProductClick={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Combo XIS/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar configuração de Combo XIS' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('mostra preço anterior e promocional no produto do catálogo', () => {
    render(
      <ProductCard
        {...fixedOffer.components[0].product}
        onClick={vi.fn()}
        showImage={false}
        showBadges
        promotionalPrice={2000}
      />,
    );
    expect(screen.getByText('Preço anterior:')).toBeInTheDocument();
    expect(screen.getByText('Preço da oferta:')).toBeInTheDocument();
    expect(screen.getByText(/20,00/)).toBeVisible();
  });

  it('abre uma promoção de produto sem foto sem tentar acessar campos de combo', () => {
    const onProductClick = vi.fn();
    render(
      <StorefrontOffers
        offers={[
          {
            kind: 'PRODUCT_PROMOTION',
            id: 'promo',
            version: 1,
            regularPrice: 2500,
            offerPrice: 2000,
            savings: 500,
            product: fixedOffer.components[0].product,
          },
        ]}
        storeOpen
        onProductClick={onProductClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /X-Burguer Clássico/ }));
    expect(onProductClick).toHaveBeenCalledWith(fixedOffer.components[0].product, 2000);
  });
});
