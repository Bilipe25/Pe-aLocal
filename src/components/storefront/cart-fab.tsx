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
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl">
      <Link
        href={`/${storeSlug}/cart`}
        className="flex items-center justify-between rounded-xl bg-pimenta px-4 py-3 text-white shadow-lg transition-all hover:bg-pimenta/90 active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingBag className="h-5 w-5" />
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-pimenta">
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
