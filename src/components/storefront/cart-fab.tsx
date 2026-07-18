'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { formatCurrency } from '@/lib/utils';

export function CartFab() {
  const getTotal = useCartStore((s) => s.getTotal);
  const getItemCount = useCartStore((s) => s.getItemCount);
  const storeSlug = useCartStore((s) => s.storeSlug);

  const count = getItemCount();
  if (count === 0 || !storeSlug) return null;

  return (
    <div className="storefront-cart-fab fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] z-40 mx-auto max-w-2xl">
      <Link
        href={`/${storeSlug}/cart`}
        className="storefront-primary-action flex items-center justify-between rounded-xl px-4 py-3 shadow-md transition-transform active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            <span className="storefront-cart-count absolute -right-2.5 -top-2.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold">
              {count}
            </span>
          </div>
          <span className="font-body font-medium">Ver sacola</span>
        </div>
        <span className="font-mono font-bold">
          {formatCurrency(getTotal())}
        </span>
      </Link>
    </div>
  );
}
