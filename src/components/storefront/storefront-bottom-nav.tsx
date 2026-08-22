'use client';

import { BookOpen, Heart, ReceiptText, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import {
  selectCartItemCount,
  selectCartStoreId,
  subscribeToCartStorage,
  useCartStore,
} from '@/stores/cart-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

interface StorefrontBottomNavProps {
  storeId: string;
  storeSlug: string;
  showFavorites?: boolean;
}

export function StorefrontBottomNav({
  storeId,
  storeSlug,
  showFavorites = false,
}: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const activeCartStoreId = useCartStore(selectCartStoreId);
  const cartItemCount = useCartStore(selectCartItemCount);
  const setCartStore = useCartStore((state) => state.setStore);
  const favoriteProductIds = useFavoritesStore((state) => state.productIds);
  const setFavoritesStore = useFavoritesStore((state) => state.setStore);
  const hasFavorites = favoriteProductIds.length > 0;
  const historyOrders = usePublicOrderHistoryStore((state) => state.orders);
  const setOrderHistoryStore = usePublicOrderHistoryStore((state) => state.setStore);
  const hasOrders = historyOrders.length > 0;

  const catalogPath = `/${storeSlug}`;
  const cartPath = `${catalogPath}/cart`;
  const checkoutPath = `${catalogPath}/checkout`;
  const ordersPath = `${catalogPath}/orders`;
  const orderPathPrefix = `${catalogPath}/order/`;
  const favoritesPath = `${catalogPath}/favorites`;
  const isCatalogActive = pathname === catalogPath || pathname === `${catalogPath}/`;
  const isCartActive = pathname === cartPath || pathname === checkoutPath;
  const isOrderActive = pathname === ordersPath || pathname.startsWith(orderPathPrefix);
  const isFavoritesActive = pathname === favoritesPath;
  const scopedCartItemCount = activeCartStoreId === storeId ? cartItemCount : 0;

  useEffect(() => {
    setCartStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setCartStore, storeId, storeSlug]);

  useEffect(() => {
    setFavoritesStore(storeId, []);
  }, [setFavoritesStore, storeId]);

  useEffect(() => {
    setOrderHistoryStore(storeId, storeSlug);
  }, [setOrderHistoryStore, storeId, storeSlug]);

  const navItems = useMemo(() => {
    const items = [
      {
        key: 'catalog',
        href: catalogPath,
        label: 'Cardápio',
        icon: BookOpen,
        active: isCatalogActive,
      },
      { key: 'cart', href: cartPath, label: 'Carrinho', icon: ShoppingBag, active: isCartActive },
    ];
    if (showFavorites) {
      items.push({
        key: 'favorites',
        href: favoritesPath,
        label: 'Favoritos',
        icon: Heart,
        active: isFavoritesActive,
      });
    }
    items.push({
      key: 'order',
      href: ordersPath,
      label: 'Meu pedido',
      icon: ReceiptText,
      active: isOrderActive,
    });
    return items;
  }, [
    catalogPath,
    cartPath,
    favoritesPath,
    isCartActive,
    isCatalogActive,
    isFavoritesActive,
    isOrderActive,
    ordersPath,
    showFavorites,
  ]);

  return (
    <nav className="storefront-bottom-nav" aria-label="Navegação da loja">
      <div className="storefront-bottom-nav-inner" data-nav-items={navItems.length}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isCartItem = item.key === 'cart';
          return (
            <Link
              key={item.key}
              href={item.href}
              data-key={item.key}
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
                {item.key === 'order' && hasOrders && (
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
