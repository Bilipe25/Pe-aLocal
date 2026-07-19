'use client';

import { Building2, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/tenants', label: 'Estabelecimentos', icon: Building2 },
] as const;

function isCurrent(pathname: string, href: string) {
  return href === '/admin' ? pathname === href : pathname.startsWith(href);
}

function NavigationLinks() {
  const pathname = usePathname();

  return items.map((item) => {
    const current = isCurrent(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
          current
            ? 'bg-brand-50 text-brand-700'
            : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
        )}
      >
        <item.icon className="h-4 w-4" aria-hidden="true" />
        {item.label}
      </Link>
    );
  });
}

export function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? 'Administração geral no celular' : 'Administração geral'}
      className={
        mobile
          ? 'border-border mx-auto mt-3 flex max-w-7xl items-center gap-1 border-t pt-3 md:hidden'
          : 'hidden items-center gap-1 md:flex'
      }
    >
      <NavigationLinks />
    </nav>
  );
}
