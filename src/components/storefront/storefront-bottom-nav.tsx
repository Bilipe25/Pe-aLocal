'use client';

import { BookOpen, Heart, LoaderCircle, ReceiptText, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import {
  selectCartItemCount,
  selectCartStoreId,
  subscribeToCartStorage,
  useCartStore,
} from '@/stores/cart-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import { useLastOrderStore } from '@/stores/last-order-store';

interface StorefrontBottomNavProps {
  storeId: string;
  storeSlug: string;
  showFavorites?: boolean;
}

export function StorefrontBottomNav({ storeId, storeSlug, showFavorites = false }: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeCartStoreId = useCartStore(selectCartStoreId);
  const cartItemCount = useCartStore(selectCartItemCount);
  const setCartStore = useCartStore((state) => state.setStore);
  const favoriteProductIds = useFavoritesStore((state) => state.productIds);
  const setFavoritesStore = useFavoritesStore((state) => state.setStore);
  const lastOrder = useLastOrderStore((state) => state.record);
  const setLastOrderStore = useLastOrderStore((state) => state.setStore);
  const clearLastOrder = useLastOrderStore((state) => state.clearOrder);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCheckingOrder, startCheckingOrder] = useTransition();
  const hasFavorites = favoriteProductIds.length > 0;

  const catalogPath = `/${storeSlug}`;
  const cartPath = `${catalogPath}/cart`;
  const checkoutPath = `${catalogPath}/checkout`;
  const orderPathPrefix = `${catalogPath}/order/`;
  const favoritesPath = `${catalogPath}/favorites`;
  const isCatalogActive = pathname === catalogPath || pathname === `${catalogPath}/`;
  const isCartActive = pathname === cartPath || pathname === checkoutPath;
  const isOrderActive = pathname.startsWith(orderPathPrefix);
  const isFavoritesActive = pathname === favoritesPath;
  const scopedCartItemCount = activeCartStoreId === storeId ? cartItemCount : 0;

  useEffect(() => {
    setCartStore(storeId, storeSlug);
    setLastOrderStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setCartStore, setLastOrderStore, storeId, storeSlug]);

  useEffect(() => {
    setFavoritesStore(storeId, []);
  }, [setFavoritesStore, storeId]);

  const navItems = useMemo(() => {
    const items = [
      { key: 'catalog', href: catalogPath, label: 'Cardápio', icon: BookOpen, active: isCatalogActive },
      { key: 'cart', href: cartPath, label: 'Carrinho', icon: ShoppingBag, active: isCartActive },
    ];
    if (showFavorites) {
      items.push({ key: 'favorites', href: favoritesPath, label: 'Favoritos', icon: Heart, active: isFavoritesActive });
    }
    items.push({ key: 'order', href: orderPathPrefix, label: 'Meu pedido', icon: ReceiptText, active: isOrderActive });
    return items;
  }, [catalogPath, cartPath, favoritesPath, isCartActive, isCatalogActive, isFavoritesActive, isOrderActive, orderPathPrefix, showFavorites]);

  function openLastOrder() {
    setStatusMessage(null);
    if (!lastOrder || lastOrder.storeId !== storeId || lastOrder.storeSlug !== storeSlug) {
      setStatusMessage('Você ainda não tem um pedido recente nesta loja.');
      return;
    }

    startCheckingOrder(async () => {
      try {
        const response = await fetch(
          `/api/orders/track/${encodeURIComponent(lastOrder.trackingToken)}?storeSlug=${encodeURIComponent(storeSlug)}`,
          {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          },
        );
        if (response.ok) {
          router.push(`${orderPathPrefix}${lastOrder.trackingToken}`);
          return;
        }
        if (response.status === 400 || response.status === 404 || response.status === 410) {
          clearLastOrder();
          setStatusMessage('O pedido salvo não está mais disponível.');
          return;
        }
        setStatusMessage('Não foi possível consultar seu pedido agora. Tente novamente.');
      } catch {
        setStatusMessage('Não foi possível consultar seu pedido agora. Verifique sua conexão.');
      }
    });
  }

  return (
    <nav className="storefront-bottom-nav" aria-label="Navegação da loja">
      {statusMessage && (
        <p id="storefront-bottom-nav-status" className="storefront-bottom-nav-status" role="status">
          {statusMessage}
        </p>
      )}
      <div
        className="storefront-bottom-nav-inner"
        data-nav-items={navItems.length}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isCartItem = item.key === 'cart';
          const isOrderButton = item.key === 'order';
          if (isOrderButton) {
            return (
              <button
                key={item.key}
                type="button"
                data-key={item.key}
                onClick={() => {
                  setStatusMessage(null);
                  openLastOrder();
                }}
                disabled={isCheckingOrder}
                className={`storefront-bottom-nav-item ${item.active ? 'is-active' : ''}`}
                aria-current={item.active ? 'page' : undefined}
                aria-describedby={statusMessage ? 'storefront-bottom-nav-status' : undefined}
              >
                <span className="storefront-bottom-nav-icon">
                  {isCheckingOrder ? (
                    <LoaderCircle className="storefront-bottom-nav-spinner" aria-hidden="true" />
                  ) : (
                    <Icon aria-hidden="true" />
                  )}
                </span>
                <span>{item.label}</span>
              </button>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              data-key={item.key}
              onClick={() => setStatusMessage(null)}
              className={`storefront-bottom-nav-item ${item.active ? 'is-active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
              aria-label={
                isCartItem && scopedCartItemCount > 0
                  ? `Carrinho, ${scopedCartItemCount} ${scopedCartItemCount === 1 ? 'item' : 'itens'}`
                  : item.label
              }
            >
              <span className="storefront-bottom-nav-icon">
                <Icon aria-hidden="true" />
                {isCartItem && scopedCartItemCount > 0 && (
                  <span className="storefront-bottom-nav-badge" aria-hidden="true">
                    {scopedCartItemCount > 99 ? '99+' : scopedCartItemCount}
                  </span>
                )}
                {item.key === 'favorites' && hasFavorites && (
                  <span className="storefront-bottom-nav-favorite-dot" aria-hidden="true" />
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
