'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface StoreHeaderVisibilityProps {
  children: ReactNode;
}

export function StoreHeaderVisibility({ children }: StoreHeaderVisibilityProps) {
  const pathname = usePathname();
  const routeName = pathname.split('/').filter(Boolean).at(-1);
  const hideOnMobile = routeName === 'cart' || routeName === 'checkout';

  return <div className={hideOnMobile ? 'max-md:hidden' : undefined}>{children}</div>;
}
