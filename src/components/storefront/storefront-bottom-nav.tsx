'use client';

import { BookOpen, CircleEllipsis, ReceiptText, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';

import {
  selectCartItemCount,
  selectCartStoreId,
  subscribeToCartStorage,
  useCartStore,
} from '@/stores/cart-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

interface StorefrontBottomNavProps {
  storeId: string;
  storeSlug: string;
}

export function StorefrontBottomNav({ storeId, storeSlug }: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const activeCartStoreId = useCartStore(selectCartStoreId);
  const cartItemCount = useCartStore(selectCartItemCount);
  const setCartStore = useCartStore((state) => state.setStore);
  const historyOrders = usePublicOrderHistoryStore((state) => state.orders);
  const setOrderHistoryStore = usePublicOrderHistoryStore((state) => state.setStore);
  const hasOrders = historyOrders.length > 0;

  const catalogPath = `/${storeSlug}`;
  const cartPath = `${catalogPath}/cart`;
  const checkoutPath = `${catalogPath}/checkout`;
  const ordersPath = `${catalogPath}/orders`;
  const orderPathPrefix = `${catalogPath}/order/`;
  const morePath = `${catalogPath}/mais`;
  const favoritesPath = `${catalogPath}/favorites`;
  const accountPath = `${catalogPath}/account`;
  const isCatalogActive = pathname === catalogPath || pathname === `${catalogPath}/`;
  const isCartActive = pathname === cartPath || pathname === checkoutPath;
  const isOrderActive = pathname === ordersPath || pathname.startsWith(orderPathPrefix);
  const isMoreActive =
    pathname === morePath ||
    pathname.startsWith(`${morePath}/`) ||
    pathname === favoritesPath ||
    pathname.startsWith(`${favoritesPath}/`) ||
    pathname === accountPath ||
    pathname.startsWith(`${accountPath}/`);
  const scopedCartItemCount = activeCartStoreId === storeId ? cartItemCount : 0;

  useEffect(() => {
    setCartStore(storeId, storeSlug);
    return subscribeToCartStorage(storeId, storeSlug);
  }, [setCartStore, storeId, storeSlug]);

  useEffect(() => {
    setOrderHistoryStore(storeId, storeSlug);
  }, [setOrderHistoryStore, storeId, storeSlug]);

  const navItems = useMemo(() => {
    return [
      {
        key: 'catalog',
        href: catalogPath,
        label: 'Cardápio',
        icon: BookOpen,
        active: isCatalogActive,
      },
      { key: 'cart', href: cartPath, label: 'Carrinho', icon: ShoppingBag, active: isCartActive },
      {
        key: 'order',
        href: ordersPath,
        label: 'Pedidos',
        icon: ReceiptText,
        active: isOrderActive,
      },
      {
        key: 'more',
        href: morePath,
        label: 'Mais',
        icon: CircleEllipsis,
        active: isMoreActive,
      },
    ];
  }, [
    catalogPath,
    cartPath,
    isCartActive,
    isCatalogActive,
    isMoreActive,
    isOrderActive,
    morePath,
    ordersPath,
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
                {item.key === 'order' && hasOrders && (
                  <span className="storefront-bottom-nav-indicator" aria-hidden="true" />
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
