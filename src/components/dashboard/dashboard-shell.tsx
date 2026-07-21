'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StoreSwitcher, type StoreSwitcherItem } from '@/components/dashboard/store-switcher';
import { cn } from '@/lib/utils';

interface DashboardShellProps {
  children: ReactNode;
  userName: string;
  stores: StoreSwitcherItem[];
  activeStore: StoreSwitcherItem | null;
}

function Navigation({
  pathname,
  activeStoreId,
  onNavigate,
}: {
  pathname: string;
  activeStoreId: string | null;
  onNavigate?: () => void;
}) {
  const fallbackHref = '/dashboard/stores';
  const navItems = [
    {
      href: activeStoreId ? '/dashboard' : fallbackHref,
      label: 'Visão geral',
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: activeStoreId ? '/dashboard/orders' : fallbackHref,
      label: 'Pedidos',
      icon: ShoppingBag,
    },
    {
      href: activeStoreId ? '/dashboard/catalog' : fallbackHref,
      label: 'Catálogo',
      icon: UtensilsCrossed,
    },
    { href: activeStoreId ? '/dashboard/delivery' : fallbackHref, label: 'Entrega', icon: Truck },
    {
      href: activeStoreId ? `/dashboard/stores/${activeStoreId}` : fallbackHref,
      label: 'Minha loja',
      icon: Settings,
    },
  ];

  return (
    <nav aria-label="Navegação do estabelecimento" className="space-y-1">
      {navItems.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
            )}
          >
            <item.icon aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter({ userName }: { userName: string }) {
  return (
    <div className="border-border border-t pt-4">
      <p className="text-text-primary truncate px-3 text-sm font-medium">{userName}</p>
      <form action="/api/auth/logout" method="POST" className="mt-1">
        <Button type="submit" variant="ghost" className="text-text-secondary w-full justify-start">
          <LogOut aria-hidden="true" /> Sair
        </Button>
      </form>
    </div>
  );
}

export function DashboardShell({ children, userName, stores, activeStore }: DashboardShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="dashboard-shell bg-surface-secondary min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-border bg-surface sticky top-0 hidden h-screen border-r p-4 lg:flex lg:flex-col">
        <Link
          href="/dashboard"
          className="text-text-primary flex min-h-11 items-center px-2 text-lg font-bold"
        >
          PedidoLocal
        </Link>
        <div className="mt-4 flex-1 overflow-y-auto">
          <StoreSwitcher stores={stores} activeStore={activeStore} />
          <Navigation pathname={pathname} activeStoreId={activeStore?.id ?? null} />
        </div>
        <AccountFooter userName={userName} />
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-surface sticky top-0 z-30 flex min-h-16 items-center justify-between border-b px-4 lg:hidden">
          <Link
            href="/dashboard"
            className="text-text-primary flex min-h-11 items-center text-lg font-bold"
          >
            PedidoLocal
          </Link>
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu do painel">
                <Menu aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="bg-tinta/50 fixed inset-0 z-40" />
              <Dialog.Content className="bg-surface fixed inset-y-0 right-0 z-50 flex w-[min(88vw,20rem)] flex-col p-4 shadow-lg focus:outline-none">
                <div className="flex min-h-11 items-center justify-between">
                  <Dialog.Title className="text-text-primary text-lg font-bold">
                    Menu do painel
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Fechar menu do painel">
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="mt-4 flex-1 overflow-y-auto">
                  <StoreSwitcher stores={stores} activeStore={activeStore} />
                  <Navigation
                    pathname={pathname}
                    activeStoreId={activeStore?.id ?? null}
                    onNavigate={() => setMenuOpen(false)}
                  />
                </div>
                <AccountFooter userName={userName} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
