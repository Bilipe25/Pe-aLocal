'use client';

import { BookOpen, CircleEllipsis, ReceiptText, ShoppingBag } from 'lucide-react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { selectCartItemCount, selectCartStoreId, useCartStore } from '@/stores/cart-store';
import { usePublicOrderHistoryStore } from '@/stores/public-order-history-store';

interface StorefrontBottomNavProps {
  storeId: string;
  storeSlug: string;
}

type StorefrontNavKey = 'catalog' | 'cart' | 'order' | 'more';

export function resolveStorefrontNavKey(
  pathname: string,
  storeSlug: string,
): StorefrontNavKey | null {
  const catalogPath = `/${storeSlug}`;
  if (pathname === catalogPath || pathname === `${catalogPath}/`) return 'catalog';
  if (pathname === `${catalogPath}/cart` || pathname === `${catalogPath}/checkout`) return 'cart';
  if (pathname === `${catalogPath}/orders` || pathname.startsWith(`${catalogPath}/order/`)) {
    return 'order';
  }
  if (
    pathname === `${catalogPath}/mais` ||
    pathname.startsWith(`${catalogPath}/mais/`) ||
    pathname === `${catalogPath}/favorites` ||
    pathname.startsWith(`${catalogPath}/favorites/`) ||
    pathname === `${catalogPath}/account` ||
    pathname.startsWith(`${catalogPath}/account/`)
  ) {
    return 'more';
  }
  return null;
}

function StorefrontNavItemContent({
  active,
  cartItemCount,
  hasOrders,
  icon: Icon,
  itemKey,
  label,
  onPendingChange,
}: {
  active: boolean;
  cartItemCount: number;
  hasOrders: boolean;
  icon: typeof BookOpen;
  itemKey: StorefrontNavKey;
  label: string;
  onPendingChange: (key: StorefrontNavKey, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    onPendingChange(itemKey, pending);
  }, [itemKey, onPendingChange, pending]);

  return (
    <span
      className={`storefront-bottom-nav-item ${active || pending ? 'is-active' : ''} ${pending ? 'is-pending' : ''}`}
    >
      <span className="storefront-bottom-nav-icon">
        <Icon aria-hidden="true" />
        {itemKey === 'cart' && cartItemCount > 0 && (
          <span className="storefront-bottom-nav-badge" aria-hidden="true">
            {cartItemCount > 99 ? '99+' : cartItemCount}
          </span>
        )}
        {itemKey === 'order' && hasOrders && (
          <span className="storefront-bottom-nav-indicator" aria-hidden="true" />
        )}
      </span>
      <span>{label}</span>
      {pending ? (
        <span className="sr-only" role="status" aria-live="polite">
          Abrindo {label}
        </span>
      ) : null}
    </span>
  );
}

export function StorefrontBottomNav({ storeId, storeSlug }: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const activeCartStoreId = useCartStore(selectCartStoreId);
  const cartItemCount = useCartStore(selectCartItemCount);
  const historyOrders = usePublicOrderHistoryStore((state) => state.orders);
  const hasOrders = historyOrders.length > 0;

  const catalogPath = `/${storeSlug}`;
  const cartPath = `${catalogPath}/cart`;
  const ordersPath = `${catalogPath}/orders`;
  const morePath = `${catalogPath}/mais`;
  const activeKey = resolveStorefrontNavKey(pathname, storeSlug);
  const [confirmedKey, setConfirmedKey] = useState(activeKey);
  const [pendingKey, setPendingKey] = useState<StorefrontNavKey | null>(null);
  const scopedCartItemCount = activeCartStoreId === storeId ? cartItemCount : 0;

  const handlePendingChange = useCallback((key: StorefrontNavKey, pending: boolean) => {
    setPendingKey((current) => (pending ? key : current === key ? null : current));
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (pendingKey === null) setConfirmedKey(activeKey);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeKey, pendingKey]);

  const navItems = [
    { key: 'catalog' as const, href: catalogPath, label: 'Cardápio', icon: BookOpen },
    { key: 'cart' as const, href: cartPath, label: 'Carrinho', icon: ShoppingBag },
    { key: 'order' as const, href: ordersPath, label: 'Pedidos', icon: ReceiptText },
    { key: 'more' as const, href: morePath, label: 'Mais', icon: CircleEllipsis },
  ];

  return (
    <nav className="storefront-bottom-nav" aria-label="Navegação da loja">
      <div className="storefront-bottom-nav-inner" data-nav-items={navItems.length}>
        {navItems.map((item) => {
          const isCartItem = item.key === 'cart';
          const active = activeKey === item.key;
          const confirmed = confirmedKey === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              data-key={item.key}
              className="storefront-bottom-nav-link"
              aria-current={confirmed ? 'page' : undefined}
              aria-label={
                isCartItem && scopedCartItemCount > 0
                  ? `Carrinho, ${scopedCartItemCount} ${scopedCartItemCount === 1 ? 'item' : 'itens'}`
                  : item.label
              }
            >
              <StorefrontNavItemContent
                active={active}
                cartItemCount={scopedCartItemCount}
                hasOrders={hasOrders}
                icon={item.icon}
                itemKey={item.key}
                label={item.label}
                onPendingChange={handlePendingChange}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
