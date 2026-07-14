import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Truck, Settings, Users } from 'lucide-react';

export const metadata = {
  title: 'Dashboard',
  description: 'Painel administrativo do seu estabelecimento.',
};

export default function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Dashboard</h1>

      <div className="mb-8 rounded-xl border border-warning bg-warning-light p-4">
        <p className="text-sm font-medium text-warning">
          🚧 Painel em construção — Fase 1 (Fundação) concluída
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          As funcionalidades do painel serão implementadas nas fases seguintes.
        </p>
      </div>

      {/* Cards de navegação */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: 'Pedidos',
            description: 'Gerencie os pedidos da sua loja',
            icon: ShoppingBag,
            href: '/dashboard/orders',
            phase: 'Fase 6',
          },
          {
            title: 'Catálogo',
            description: 'Gerencie categorias e produtos',
            icon: UtensilsCrossed,
            href: '/dashboard/catalog',
            phase: 'Fase 3',
          },
          {
            title: 'Entrega',
            description: 'Configure bairros e taxas',
            icon: Truck,
            href: '/dashboard/delivery',
            phase: 'Fase 3',
          },
          {
            title: 'Loja',
            description: 'Configure sua loja',
            icon: Settings,
            href: '/dashboard/store',
            phase: 'Fase 3',
          },
          {
            title: 'Equipe',
            description: 'Gerencie sua equipe',
            icon: Users,
            href: '/dashboard/team',
            phase: 'Fase 2',
          },
          {
            title: 'Relatórios',
            description: 'Visualize relatórios e métricas',
            icon: LayoutDashboard,
            href: '/dashboard/reports',
            phase: 'Fase 6',
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-border bg-surface p-5 opacity-60 shadow-sm"
          >
            <div className="mb-3 flex items-center justify-between">
              <item.icon className="h-5 w-5 text-brand-500" />
              <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs text-text-muted">
                {item.phase}
              </span>
            </div>
            <h3 className="font-semibold text-text-primary">{item.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
