'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  UtensilsCrossed,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/orders', label: 'Pedidos', icon: ShoppingBag },
  { href: '/dashboard/catalog', label: 'Catálogo', icon: UtensilsCrossed },
  { href: '/dashboard/delivery', label: 'Entrega', icon: Truck },
  { href: '/dashboard/store', label: 'Minha loja', icon: Settings },
];

const STATUS_LABELS = {
  OPEN: { label: 'Aberta', className: 'bg-success-light text-success' },
  CLOSED: { label: 'Fechada', className: 'bg-error-light text-error' },
  PAUSED: { label: 'Pausada', className: 'bg-warning-light text-warning' },
} as const;

interface DashboardShellProps {
  children: ReactNode;
  userName: string;
  store: {
    name: string;
    slug: string;
    status: keyof typeof STATUS_LABELS;
  } | null;
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navegação do estabelecimento" className="space-y-1">
      {NAV_ITEMS.map((item) => {
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

function StoreSummary({ store }: Pick<DashboardShellProps, 'store'>) {
  if (!store) return null;
  const status = STATUS_LABELS[store.status];

  return (
    <div className="mb-5 rounded-xl bg-surface-secondary p-3">
      <div className="flex items-start gap-2">
        <Store className="mt-0.5 text-brand-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{store.name}</p>
          <span className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', status.className)}>
            {status.label}
          </span>
        </div>
      </div>
      <Button asChild variant="ghost" size="sm" className="mt-2 w-full justify-start">
        <Link href={`/${store.slug}`} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" /> Ver cardápio
        </Link>
      </Button>
    </div>
  );
}

function AccountFooter({ userName }: { userName: string }) {
  return (
    <div className="border-border border-t pt-4">
      <p className="truncate px-3 text-sm font-medium text-text-primary">{userName}</p>
      <form action="/api/auth/logout" method="POST" className="mt-1">
        <Button type="submit" variant="ghost" className="w-full justify-start text-text-secondary">
          <LogOut aria-hidden="true" /> Sair
        </Button>
      </form>
    </div>
  );
}

export function DashboardShell({ children, userName, store }: DashboardShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="dashboard-shell min-h-screen bg-surface-secondary lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-surface p-4 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex min-h-11 items-center px-2 text-lg font-bold text-text-primary">
          PedidoLocal
        </Link>
        <div className="mt-4 flex-1 overflow-y-auto">
          <StoreSummary store={store} />
          <Navigation pathname={pathname} />
        </div>
        <AccountFooter userName={userName} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
          <Link href="/dashboard" className="flex min-h-11 items-center text-lg font-bold text-text-primary">
            PedidoLocal
          </Link>
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu do painel">
                <Menu aria-hidden="true" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-tinta/50" />
              <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,20rem)] flex-col bg-surface p-4 shadow-lg focus:outline-none">
                <div className="flex min-h-11 items-center justify-between">
                  <Dialog.Title className="text-lg font-bold text-text-primary">Menu do painel</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Fechar menu do painel">
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>
                <div className="mt-4 flex-1 overflow-y-auto">
                  <StoreSummary store={store} />
                  <Navigation pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                </div>
                <AccountFooter userName={userName} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
