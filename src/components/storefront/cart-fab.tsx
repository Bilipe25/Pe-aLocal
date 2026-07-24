'use client';

import Link from 'next/link';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import {
  selectCartItemCount,
  selectCartStoreId,
  selectCartStoreSlug,
  selectCartTotal,
  useCartStore,
} from '@/stores/cart-store';
import { formatCurrency } from '@/lib/utils';

export function CartFab({ storeId }: { storeId: string }) {
  const activeStoreId = useCartStore(selectCartStoreId);
  const storeSlug = useCartStore(selectCartStoreSlug);
  const count = useCartStore(selectCartItemCount);
  const total = useCartStore(selectCartTotal);

  if (activeStoreId !== storeId || count === 0 || !storeSlug) return null;

  return (
    <div className="storefront-cart-fab">
      <Link
        href={`/${storeSlug}/cart`}
        className="storefront-cart-fab-link"
        aria-label={`Ver carrinho com ${count} ${count === 1 ? 'item' : 'itens'}, total ${formatCurrency(total)}`}
      >
        <span className="storefront-cart-fab-leading">
          <span className="storefront-cart-fab-icon">
            <ShoppingBag aria-hidden="true" />
            <span key={count} className="storefront-cart-count" aria-hidden="true">
              {count}
            </span>
          </span>
          <span className="storefront-cart-fab-copy">
            <strong>Ver carrinho</strong>
            <span>
              {count} {count === 1 ? 'item' : 'itens'}
            </span>
          </span>
        </span>
        <span className="storefront-cart-fab-total">{formatCurrency(total)}</span>
        <ChevronRight className="storefront-cart-fab-chevron" aria-hidden="true" />
      </Link>
    </div>
  );
}
