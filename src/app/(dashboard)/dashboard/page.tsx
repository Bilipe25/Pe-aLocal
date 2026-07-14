import Link from 'next/link';
import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Truck, Settings, Users } from 'lucide-react';

export const metadata = {
  title: 'Dashboard',
  description: 'Painel administrativo do seu estabelecimento.',
};

const NAV_ITEMS = [
  {
    title: 'Catálogo',
    description: 'Gerencie categorias e produtos',
    icon: UtensilsCrossed,
    href: '/dashboard/catalog',
    ready: true,
  },
  {
    title: 'Entrega',
    description: 'Configure bairros e taxas',
    icon: Truck,
    href: '/dashboard/delivery',
    ready: true,
  },
  {
    title: 'Loja',
    description: 'Configure sua loja',
    icon: Settings,
    href: '/dashboard/store',
    ready: true,
  },
  {
    title: 'Pedidos',
    description: 'Gerencie os pedidos da sua loja',
    icon: ShoppingBag,
    href: '/dashboard/orders',
    ready: false,
    phase: 'Fase 5',
  },
  {
    title: 'Equipe',
    description: 'Gerencie sua equipe',
    icon: Users,
    href: '/dashboard/team',
    ready: false,
    phase: 'Fase 5',
  },
  {
    title: 'Relatórios',
    description: 'Visualize relatórios e métricas',
    icon: LayoutDashboard,
    href: '/dashboard/reports',
    ready: false,
    phase: 'Fase 6',
  },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map((item) =>
          item.ready ? (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-brand-200 hover:shadow-md"
            >
              <div className="mb-3">
                <item.icon className="h-5 w-5 text-brand-500" />
              </div>
              <h3 className="font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
            </Link>
          ) : (
            <div
              key={item.title}
              className="rounded-xl border border-border bg-surface p-5 opacity-50 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <item.icon className="h-5 w-5 text-text-tertiary" />
                <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-muted">
                  {item.phase}
                </span>
              </div>
              <h3 className="font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
