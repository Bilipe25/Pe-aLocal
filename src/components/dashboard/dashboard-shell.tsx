'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CalendarDays,
  Bell,
  ChartNoAxesCombined,
  ChefHat,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  TicketPercent,
  Truck,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';

import { StoreSwitcher, type StoreSwitcherItem } from '@/components/dashboard/store-switcher';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TenantRole } from '@/server/permissions';
import { useDashboardOperations } from '@/components/dashboard/dashboard-operations-context';
import {
  StorePushSubscription,
  StorePushSubscriptionProvider,
} from '@/components/dashboard/store-push-subscription';

interface DashboardShellProps {
  children: ReactNode;
  userName: string;
  tenantRole: TenantRole;
  stores: StoreSwitcherItem[];
  activeStore: StoreSwitcherItem | null;
  activeStoreTimeZone: string | null;
  initialNowIso: string;
  canViewCoupons?: boolean;
  canViewKds?: boolean;
  canViewDiningRoom?: boolean;
  canViewReports?: boolean;
  merchantPush?: { publicVapidKey: string; storeId: string; storeName: string };
}

const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  ATTENDANT: 'Atendente',
};

function Brand({
  inverse = false,
  compactOnNarrow = false,
}: {
  inverse?: boolean;
  compactOnNarrow?: boolean;
}) {
  return (
    <Link
      href="/dashboard"
      aria-label="PedidoLocal — ir para a visão geral"
      className={cn(
        'flex min-h-11 items-center gap-2.5 rounded-md px-1 text-[1.125rem] font-bold tracking-[-0.035em] focus-visible:ring-2 focus-visible:outline-none',
        inverse
          ? 'text-white focus-visible:ring-white/80'
          : 'text-text-primary focus-visible:ring-brand-500',
      )}
    >
      <Image
        src="/pwa/pedidolocal-icon-v1-192.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 object-contain"
        priority
      />
      <span className={compactOnNarrow ? 'hidden min-[360px]:inline' : undefined}>
        Pedido<span className={inverse ? 'text-brand-300' : 'text-brand-600'}>Local</span>
      </span>
    </Link>
  );
}

function Navigation({
  pathname,
  activeStoreId,
  canViewCoupons = false,
  canViewKds = false,
  canViewDiningRoom = false,
  canViewReports = false,
  appearance = 'light',
  onNavigate,
}: {
  pathname: string;
  activeStoreId: string | null;
  canViewCoupons: boolean;
  canViewKds: boolean;
  canViewDiningRoom: boolean;
  canViewReports: boolean;
  appearance?: 'light' | 'dark';
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
      label: 'Central de pedidos',
      icon: ShoppingBag,
    },
    {
      href: activeStoreId ? '/dashboard/kds' : fallbackHref,
      label: 'Cozinha',
      icon: ChefHat,
      hidden: !canViewKds,
    },
    {
      href: activeStoreId ? '/dashboard/dining-room' : fallbackHref,
      label: 'Salão',
      icon: LayoutGrid,
      hidden: !canViewDiningRoom,
    },
    {
      href: activeStoreId ? '/dashboard/catalog' : fallbackHref,
      label: 'Catálogo',
      icon: UtensilsCrossed,
    },
    {
      href: activeStoreId ? '/dashboard/coupons' : fallbackHref,
      label: 'Cupons',
      icon: TicketPercent,
      hidden: !canViewCoupons,
    },
    {
      href: activeStoreId ? '/dashboard/reports' : fallbackHref,
      label: 'Relatórios',
      icon: ChartNoAxesCombined,
      hidden: !canViewReports,
    },
    { href: activeStoreId ? '/dashboard/delivery' : fallbackHref, label: 'Entrega', icon: Truck },
    {
      href: activeStoreId ? `/dashboard/stores/${activeStoreId}` : fallbackHref,
      label: 'Minha loja',
      icon: Settings,
    },
  ].filter((item) => !item.hidden);

  return (
    <nav aria-label="Navegação do estabelecimento" className="space-y-1.5">
      {appearance === 'dark' && (
        <p className="px-3 pb-2 text-[0.6875rem] font-semibold tracking-[0.08em] text-white/45">
          Operação
        </p>
      )}
      {navItems.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={`${item.label}-${item.href}`}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-[background-color,color] duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
              appearance === 'dark'
                ? active
                  ? "before:bg-brand-400 focus-visible:ring-offset-tinta text-brand-300 bg-white/[0.08] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r-full before:content-[''] focus-visible:ring-white/80"
                  : 'focus-visible:ring-offset-tinta text-white/70 hover:bg-white/[0.055] hover:text-white focus-visible:ring-white/80'
                : active
                  ? "before:bg-brand-500 bg-brand-50 text-brand-700 focus-visible:ring-brand-500 before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r-full before:content-['']"
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-brand-500',
            )}
          >
            <item.icon
              className={cn(
                'h-[1.125rem] w-[1.125rem] shrink-0',
                appearance === 'dark' && active && 'text-brand-300',
              )}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function getInitials(name: string) {
  const names = name.trim().split(/\s+/).filter(Boolean);
  if (names.length === 0) return 'PL';
  const first = names[0]?.[0] ?? '';
  const last = names.length > 1 ? (names.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase('pt-BR');
}

function AccountMenu({ userName, tenantRole }: { userName: string; tenantRole: TenantRole }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const roleLabel = TENANT_ROLE_LABELS[tenantRole];

  useEffect(() => {
    if (!open) return;
    logoutRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Abrir menu da conta de ${userName}, ${roleLabel}`}
        aria-expanded={open}
        aria-controls="dashboard-account-menu"
        onClick={() => setOpen((current) => !current)}
        className="focus-visible:ring-brand-500 hover:bg-surface-secondary flex min-h-11 max-w-[15rem] items-center gap-2.5 rounded-lg px-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className="bg-tinta text-text-inverse flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold">
          {getInitials(userName)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="text-text-primary block truncate text-sm font-semibold">{userName}</span>
          <span className="text-text-muted block text-xs">{roleLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            'text-text-muted h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="dashboard-account-menu"
          role="group"
          aria-label="Ações da conta"
          className="border-border bg-surface absolute top-[calc(100%+0.5rem)] right-0 z-50 w-60 rounded-xl border p-2 shadow-lg"
        >
          <div className="border-border mb-1 border-b px-3 py-2">
            <p className="text-text-primary truncate text-sm font-semibold">{userName}</p>
            <p className="text-text-muted mt-0.5 text-xs">{roleLabel}</p>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              ref={logoutRef}
              type="submit"
              className="text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus-visible:ring-brand-500 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair da conta
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function AccountFooter({ userName, tenantRole }: { userName: string; tenantRole: TenantRole }) {
  return (
    <div className="border-border border-t pt-4">
      <p className="text-text-primary truncate px-3 text-sm font-semibold">{userName}</p>
      <p className="text-text-muted mt-0.5 px-3 text-xs">{TENANT_ROLE_LABELS[tenantRole]}</p>
      <form action="/api/auth/logout" method="POST" className="mt-1">
        <Button type="submit" variant="ghost" className="text-text-secondary w-full justify-start">
          <LogOut aria-hidden="true" /> Sair
        </Button>
      </form>
    </div>
  );
}

function StoreClock({ timeZone, initialNowIso }: { timeZone: string; initialNowIso: string }) {
  const [now, setNow] = useState(() => new Date(initialNowIso));

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(now)
    .replace('.', '');
  const weekdayAndTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(now)
    .replace('.', '');

  return (
    <div
      className="text-text-secondary flex items-center gap-3 text-sm"
      aria-label={`Data e hora da loja: ${dateLabel}, ${weekdayAndTime}`}
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
        <time dateTime={now.toISOString()}>{dateLabel}</time>
      </span>
      <span className="bg-border h-5 w-px" aria-hidden="true" />
      <span className="flex items-center gap-2 whitespace-nowrap">
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <time dateTime={now.toISOString()}>{weekdayAndTime}</time>
      </span>
    </div>
  );
}

function MobileOperationsPanel({
  realtimeLabel,
  realtimeDot,
}: {
  realtimeLabel: string;
  realtimeDot: string;
}) {
  const operations = useDashboardOperations();

  return (
    <section
      className="border-border bg-surface-secondary mb-5 rounded-xl border p-3"
      aria-label="Controles operacionais dos pedidos"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-text-primary flex items-center gap-2 text-sm font-semibold">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', realtimeDot)} aria-hidden="true" />
          <span aria-live="polite">{realtimeLabel}</span>
        </p>
        {operations.recentOrderCount > 0 ? (
          <span className="bg-brand-600 rounded-full px-2 py-1 font-mono text-xs text-white">
            {Math.min(operations.recentOrderCount, 9)} novo(s)
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!operations.onToggleSound || operations.soundActivating}
          aria-pressed={operations.soundEnabled}
          onClick={() => operations.onToggleSound?.()}
        >
          {operations.soundEnabled ? (
            <Volume2 aria-hidden="true" />
          ) : (
            <VolumeX aria-hidden="true" />
          )}
          {operations.soundActivating
            ? 'Ativando…'
            : operations.soundEnabled
              ? 'Som ativo'
              : 'Ativar som'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!operations.onRefresh || operations.isRefreshing}
          aria-busy={operations.isRefreshing}
          onClick={() => operations.onRefresh?.()}
        >
          <RefreshCw
            className={operations.isRefreshing ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          {operations.isRefreshing ? 'Atualizando…' : 'Atualizar'}
        </Button>
        {operations.recentOrderCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="col-span-2"
            disabled={!operations.onOpenLatestOrder}
            onClick={() => operations.onOpenLatestOrder?.()}
          >
            <Bell aria-hidden="true" /> Abrir pedido mais recente
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key === 'Home') {
    event.currentTarget.querySelector<HTMLAnchorElement>('a')?.focus();
  }
}

export function DashboardShell({
  children,
  userName,
  tenantRole,
  stores,
  activeStore,
  activeStoreTimeZone,
  initialNowIso,
  canViewCoupons = false,
  canViewKds = false,
  canViewDiningRoom = false,
  canViewReports = false,
  merchantPush,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const isOrdersWorkspace = pathname.startsWith('/dashboard/orders');
  const isKdsWorkspace = pathname.startsWith('/dashboard/kds');
  const operations = useDashboardOperations();
  const trimmedSearch = operations.search.trim();
  const hasActiveSearch = /^#?\d+$/.test(trimmedSearch) || trimmedSearch.length >= 2;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const desktopQuery = window.matchMedia('(min-width: 80rem)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setMobileSearchOpen(false);
    };

    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  const realtimeLabel = {
    unavailable: 'Atualização automática',
    connecting: 'Conectando…',
    connected: 'Tempo real ativo',
    degraded: 'Conexão degradada',
  }[operations.realtimeState];
  const realtimeDot = {
    unavailable: 'bg-info',
    connecting: 'bg-warning',
    connected: 'bg-success',
    degraded: 'bg-warning',
  }[operations.realtimeState];

  const shell = isKdsWorkspace ? (
    <div className="kds-dashboard-shell min-h-dvh">{children}</div>
  ) : (
    <div className="dashboard-shell bg-surface-secondary min-h-dvh xl:grid xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="bg-tinta sticky top-0 hidden h-dvh border-r border-white/8 p-4 xl:flex xl:flex-col">
        <div className="px-1 py-1">
          <Brand inverse />
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          <Navigation
            pathname={pathname}
            activeStoreId={activeStore?.id ?? null}
            canViewCoupons={canViewCoupons}
            canViewKds={canViewKds}
            canViewDiningRoom={canViewDiningRoom}
            canViewReports={canViewReports}
            appearance="dark"
          />
        </div>
        {merchantPush && (
          <div className="mb-2">
            <StorePushSubscription storeName={merchantPush.storeName} />
          </div>
        )}
        {isOrdersWorkspace && (
          <div className="mb-2 px-3 py-2 text-white/65">
            <p className="flex items-center gap-2 text-xs font-medium">
              <span className={cn('h-1.5 w-1.5 rounded-full', realtimeDot)} aria-hidden="true" />
              {realtimeLabel}
            </p>
            <p className="mt-1 text-[0.6875rem] text-white/45">
              {operations.recentOrderCount > 0
                ? `${operations.recentOrderCount} novo(s) nesta sessão`
                : 'Fila sincronizada automaticamente'}
            </p>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 px-3 pt-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.6875rem] font-bold text-white/80">
            {activeStore ? getInitials(activeStore.name) : 'PL'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-white/80">
              {activeStore?.name ?? 'PedidoLocal'}
            </span>
            <span className="block text-[0.6875rem] text-white/45">Painel do estabelecimento</span>
          </span>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-border bg-surface sticky top-0 z-30 flex min-h-16 items-center justify-between border-b px-4 xl:hidden">
          <Brand compactOnNarrow={isOrdersWorkspace} />
          <div className="flex items-center gap-1">
            {isOrdersWorkspace ? (
              <Dialog.Root open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
                <Dialog.Trigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="relative"
                    id="orders-mobile-search-trigger"
                    aria-label={hasActiveSearch ? 'Abrir busca, busca ativa' : 'Buscar pedidos'}
                  >
                    <Search aria-hidden="true" />
                    {hasActiveSearch ? (
                      <span
                        className="bg-brand-600 absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-white"
                        aria-hidden="true"
                      />
                    ) : null}
                  </Button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="orders-mobile-search-overlay bg-tinta/50 fixed inset-0 z-40" />
                  <Dialog.Content
                    className="orders-mobile-search-sheet border-border bg-surface fixed top-0 right-0 left-0 z-50 mx-auto w-full max-w-xl rounded-b-2xl border border-t-0 px-4 pb-4 shadow-md focus:outline-none"
                    style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
                    aria-describedby="orders-mobile-search-description"
                    onOpenAutoFocus={(event) => {
                      event.preventDefault();
                      mobileSearchInputRef.current?.focus();
                    }}
                    onCloseAutoFocus={(event) => {
                      if (
                        typeof window.matchMedia === 'function' &&
                        window.matchMedia('(min-width: 80rem)').matches
                      ) {
                        event.preventDefault();
                        document.getElementById('orders-desktop-search-input')?.focus();
                      }
                    }}
                  >
                    <header className="flex min-h-11 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Dialog.Title className="text-text-primary text-lg font-bold">
                          Buscar pedidos
                        </Dialog.Title>
                        <Dialog.Description
                          id="orders-mobile-search-description"
                          className="text-text-secondary mt-0.5 text-sm"
                        >
                          Localize por número, cliente, telefone ou pagamento.
                        </Dialog.Description>
                      </div>
                      <Dialog.Close asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          aria-label="Fechar busca"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </Dialog.Close>
                    </header>

                    <form
                      role="search"
                      aria-label="Buscar na central de pedidos"
                      className="mt-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setMobileSearchOpen(false);
                      }}
                    >
                      <div className="relative">
                        <Search
                          className="text-text-muted pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2"
                          aria-hidden="true"
                        />
                        <input
                          ref={mobileSearchInputRef}
                          id="orders-mobile-search-input"
                          type="search"
                          inputMode="search"
                          enterKeyHint="search"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={80}
                          value={operations.search}
                          onChange={(event) => operations.setSearch(event.target.value)}
                          placeholder="Pedido, cliente, telefone…"
                          aria-label="Buscar pedidos"
                          className="border-border bg-surface text-text-primary placeholder:text-text-muted focus-visible:ring-brand-500 h-12 w-full rounded-lg border pr-12 pl-10 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                        />
                        {operations.search ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-1/2 right-0.5 -translate-y-1/2"
                            aria-label="Limpar busca"
                            onClick={() => {
                              operations.setSearch('');
                              mobileSearchInputRef.current?.focus();
                            }}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>

                      <Button type="submit" className="mt-3 w-full">
                        Ver pedidos
                      </Button>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : null}
            {isOrdersWorkspace ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative"
                id="orders-mobile-filter-trigger"
                aria-haspopup="dialog"
                aria-expanded={operations.filtersOpen}
                aria-controls="orders-mobile-filter-sheet"
                aria-label={
                  operations.activeFilterCount > 0
                    ? `Abrir filtros avançados, ${operations.activeFilterCount} ${operations.activeFilterCount === 1 ? 'filtro ativo' : 'filtros ativos'}`
                    : 'Abrir filtros avançados'
                }
                disabled={!operations.onOpenFilters}
                onClick={() => operations.onOpenFilters?.()}
              >
                <SlidersHorizontal aria-hidden="true" />
                {operations.activeFilterCount > 0 ? (
                  <span className="bg-brand-600 absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 font-mono text-[0.625rem] leading-4 text-white">
                    {Math.min(operations.activeFilterCount, 9)}
                  </span>
                ) : null}
              </Button>
            ) : null}
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
                  <div className="mt-4 flex-1 overflow-y-auto" onKeyDown={handleMenuKeyDown}>
                    <StoreSwitcher
                      stores={stores}
                      activeStore={activeStore}
                      returnTo={pathname}
                      className="mb-5 w-full"
                    />
                    {isOrdersWorkspace ? (
                      <MobileOperationsPanel
                        realtimeLabel={realtimeLabel}
                        realtimeDot={realtimeDot}
                      />
                    ) : null}
                    <Navigation
                      pathname={pathname}
                      activeStoreId={activeStore?.id ?? null}
                      canViewCoupons={canViewCoupons}
                      canViewKds={canViewKds}
                      canViewDiningRoom={canViewDiningRoom}
                      canViewReports={canViewReports}
                      onNavigate={() => setMenuOpen(false)}
                    />
                    {merchantPush && (
                      <div className="mt-5 border-t pt-5">
                        <StorePushSubscription
                          storeName={merchantPush.storeName}
                          surface="mobile-menu"
                        />
                      </div>
                    )}
                  </div>
                  <AccountFooter userName={userName} tenantRole={tenantRole} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </header>

        <header className="border-border bg-surface sticky top-0 z-30 hidden h-[4.125rem] items-center gap-4 border-b px-4 xl:flex">
          <StoreSwitcher
            stores={stores}
            activeStore={activeStore}
            returnTo={pathname}
            className="w-[min(16rem,24vw)] shrink-0"
          />
          {isOrdersWorkspace ? (
            <div className="relative max-w-xl min-w-52 flex-1">
              <Search
                className="text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="orders-desktop-search-input"
                type="search"
                maxLength={80}
                value={operations.search}
                onChange={(event) => operations.setSearch(event.target.value)}
                placeholder="Buscar pedido, cliente, telefone ou pagamento"
                aria-label="Buscar na central de pedidos"
                className="border-border bg-surface text-text-primary placeholder:text-text-muted focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-10 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              />
            </div>
          ) : (
            <span className="flex-1" />
          )}
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {activeStoreTimeZone && (
              <div className="hidden min-[1400px]:block">
                <StoreClock timeZone={activeStoreTimeZone} initialNowIso={initialNowIso} />
              </div>
            )}
            {isOrdersWorkspace && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    operations.recentOrderCount > 0
                      ? `Abrir pedido mais recente, ${operations.recentOrderCount} novo(s)`
                      : 'Nenhum pedido novo nesta sessão'
                  }
                  disabled={!operations.onOpenLatestOrder || operations.recentOrderCount === 0}
                  onClick={() => operations.onOpenLatestOrder?.()}
                  className="relative"
                >
                  <Bell aria-hidden="true" />
                  {operations.recentOrderCount > 0 && (
                    <span className="bg-brand-600 absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 font-mono text-[0.625rem] leading-4 text-white">
                      {Math.min(operations.recentOrderCount, 9)}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={
                    operations.soundEnabled
                      ? 'Desativar som de novos pedidos'
                      : 'Ativar som de novos pedidos'
                  }
                  aria-pressed={operations.soundEnabled}
                  disabled={!operations.onToggleSound || operations.soundActivating}
                  onClick={() => operations.onToggleSound?.()}
                >
                  {operations.soundEnabled ? (
                    <Volume2 aria-hidden="true" />
                  ) : (
                    <VolumeX aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Atualizar pedidos"
                  disabled={!operations.onRefresh || operations.isRefreshing}
                  aria-busy={operations.isRefreshing}
                  onClick={() => operations.onRefresh?.()}
                >
                  <RefreshCw
                    className={operations.isRefreshing ? 'animate-spin' : undefined}
                    aria-hidden="true"
                  />
                </Button>
                <span className="sr-only" aria-live="polite">
                  <Wifi aria-hidden="true" /> {realtimeLabel}
                </span>
              </>
            )}
            <AccountMenu userName={userName} tenantRole={tenantRole} />
          </div>
        </header>

        <main
          className={cn(
            'w-full',
            isOrdersWorkspace
              ? 'px-3 py-4 sm:px-4 xl:max-w-none xl:px-4 xl:py-5'
              : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 xl:px-8 xl:py-8',
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );

  return merchantPush ? (
    <StorePushSubscriptionProvider
      key={merchantPush.storeId}
      publicVapidKey={merchantPush.publicVapidKey}
    >
      {shell}
    </StorePushSubscriptionProvider>
  ) : (
    shell
  );
}
