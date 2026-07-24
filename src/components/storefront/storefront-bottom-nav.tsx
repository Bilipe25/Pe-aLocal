'use client';

import { BookOpen, LoaderCircle, ReceiptText, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { selectCartItemCount, selectCartStoreId, useCartStore } from '@/stores/cart-store';
import { useLastOrderStore } from '@/stores/last-order-store';

interface StorefrontBottomNavProps {
  storeId: string;
  storeSlug: string;
}

export function StorefrontBottomNav({ storeId, storeSlug }: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeCartStoreId = useCartStore(selectCartStoreId);
  const cartItemCount = useCartStore(selectCartItemCount);
  const setCartStore = useCartStore((state) => state.setStore);
  const lastOrder = useLastOrderStore((state) => state.record);
  const setLastOrderStore = useLastOrderStore((state) => state.setStore);
  const clearLastOrder = useLastOrderStore((state) => state.clearOrder);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCheckingOrder, startCheckingOrder] = useTransition();

  useEffect(() => {
    setCartStore(storeId, storeSlug);
    setLastOrderStore(storeId, storeSlug);
  }, [setCartStore, setLastOrderStore, storeId, storeSlug]);

  const catalogPath = `/${storeSlug}`;
  const cartPath = `${catalogPath}/cart`;
  const checkoutPath = `${catalogPath}/checkout`;
  const orderPathPrefix = `${catalogPath}/order/`;
  const isCatalogActive = pathname === catalogPath || pathname === `${catalogPath}/`;
  const isCartActive = pathname === cartPath || pathname === checkoutPath;
  const isOrderActive = pathname.startsWith(orderPathPrefix);
  const scopedCartItemCount = activeCartStoreId === storeId ? cartItemCount : 0;

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
        if (response.status === 400 || response.status === 404) {
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
      <div className="storefront-bottom-nav-inner">
        <Link
          href={catalogPath}
          onClick={() => setStatusMessage(null)}
          className={`storefront-bottom-nav-item ${isCatalogActive ? 'is-active' : ''}`}
          aria-current={isCatalogActive ? 'page' : undefined}
        >
          <BookOpen aria-hidden="true" />
          <span>Cardápio</span>
        </Link>

        <Link
          href={cartPath}
          onClick={() => setStatusMessage(null)}
          className={`storefront-bottom-nav-item ${isCartActive ? 'is-active' : ''}`}
          aria-current={isCartActive ? 'page' : undefined}
          aria-label={
            scopedCartItemCount > 0
              ? `Carrinho, ${scopedCartItemCount} ${scopedCartItemCount === 1 ? 'item' : 'itens'}`
              : 'Carrinho'
          }
        >
          <span className="storefront-bottom-nav-icon">
            <ShoppingBag aria-hidden="true" />
            {scopedCartItemCount > 0 && (
              <span className="storefront-bottom-nav-badge" aria-hidden="true">
                {scopedCartItemCount > 99 ? '99+' : scopedCartItemCount}
              </span>
            )}
          </span>
          <span>Carrinho</span>
        </Link>

        <button
          type="button"
          onClick={openLastOrder}
          disabled={isCheckingOrder}
          className={`storefront-bottom-nav-item ${isOrderActive ? 'is-active' : ''}`}
          aria-current={isOrderActive ? 'page' : undefined}
          aria-describedby={statusMessage ? 'storefront-bottom-nav-status' : undefined}
        >
          {isCheckingOrder ? (
            <LoaderCircle className="storefront-bottom-nav-spinner" aria-hidden="true" />
          ) : (
            <ReceiptText aria-hidden="true" />
          )}
          <span>Meu pedido</span>
        </button>
      </div>
    </nav>
  );
}
