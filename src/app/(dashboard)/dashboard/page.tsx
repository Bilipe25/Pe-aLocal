import Link from 'next/link';
import { ArrowRight, Clock3, ExternalLink, Settings, Truck, UtensilsCrossed } from 'lucide-react';
import type { OrderStatus } from '@prisma/client';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { listCategoriesAction, listProductsAction } from '@/features/catalog/actions';
import { listDeliveryZonesAction } from '@/features/delivery/actions';
import { getStoreForDashboard } from '@/features/stores/actions';
import { getOrdersAction } from '@/features/orders/admin-actions';

export const metadata = {
  title: 'Visão geral',
  description: 'Painel administrativo do seu estabelecimento.',
};

export default async function DashboardPage() {
  const activeStatuses: OrderStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
  const [store, categories, products, zones, ordersResult] = await Promise.all([
    getStoreForDashboard(),
    listCategoriesAction(),
    listProductsAction(),
    listDeliveryZonesAction(),
    getOrdersAction({ statuses: activeStatuses }),
  ]);
  const activeHours = store.openingHours.filter((hour) => hour.isActive).length;
  const activeOrders = ordersResult.success ? ordersResult.data : [];
  const waitingOrders = activeOrders.filter((order) => order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT').length;
  const preparingOrders = activeOrders.filter((order) => order.status === 'CONFIRMED' || order.status === 'PREPARING').length;
  const readyOrders = activeOrders.filter((order) => order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY').length;
  const setupComplete = [categories.length > 0 && products.length > 0, zones.length > 0, activeHours > 0 && Boolean(store.address)].filter(Boolean).length;

  const setupItems = [
    {
      title: 'Catálogo',
      detail: `${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'} · ${products.length} ${products.length === 1 ? 'produto' : 'produtos'}`,
      href: '/dashboard/catalog',
      icon: UtensilsCrossed,
      complete: categories.length > 0 && products.length > 0,
    },
    {
      title: 'Entrega',
      detail: `${zones.length} ${zones.length === 1 ? 'zona configurada' : 'zonas configuradas'}`,
      href: '/dashboard/delivery',
      icon: Truck,
      complete: zones.length > 0,
    },
    {
      title: 'Dados da loja',
      detail: `${activeHours} ${activeHours === 1 ? 'dia com horário' : 'dias com horários'}`,
      href: '/dashboard/store',
      icon: Settings,
      complete: activeHours > 0 && Boolean(store.address),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Acompanhe a operação e mantenha o estabelecimento pronto para receber pedidos."
        actions={
          <Button asChild variant="outline">
            <Link href={`/${store.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> Ver cardápio
            </Link>
          </Button>
        }
      />

      <section className="overflow-hidden rounded-xl bg-text-primary text-surface" aria-labelledby="shift-heading">
        <div className="p-5 sm:flex sm:items-start sm:justify-between sm:gap-8 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-surface/80">
              <Clock3 aria-hidden="true" /> Turno agora
            </div>
            <h2 id="shift-heading" className="mt-2 text-xl font-semibold">
              {activeOrders.length === 0 ? 'Nenhum pedido aguardando ação' : `${activeOrders.length} ${activeOrders.length === 1 ? 'pedido precisa' : 'pedidos precisam'} de acompanhamento`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-surface/80">
              {activeOrders.length === 0 ? 'A central está pronta. Novos pedidos aparecerão em tempo real.' : 'Abra a central para priorizar os mais antigos e atualizar cada etapa.'}
            </p>
          </div>
          <Button asChild className="mt-5 w-full bg-brand-600 hover:bg-brand-700 sm:mt-0 sm:w-auto">
            <Link href="/dashboard/orders">Abrir central <ArrowRight aria-hidden="true" /></Link>
          </Button>
        </div>
        <dl className="grid border-t border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-white/15">
          {[
            ['Aguardando atenção', waitingOrders],
            ['Em preparo', preparingOrders],
            ['Prontos para sair', readyOrders],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-white/15 px-5 py-3 last:border-b-0 sm:block sm:border-b-0 sm:px-6">
              <dt className="text-sm text-surface/75">{label}</dt>
              <dd className="font-mono text-lg font-bold text-surface sm:mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="setup-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="setup-heading" className="text-lg font-semibold text-text-primary">Pronto para vender</h2>
            <p className="mt-1 text-sm text-text-secondary">{setupComplete} de 3 etapas essenciais revisadas.</p>
          </div>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {setupItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-20 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-secondary sm:px-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <item.icon aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-text-primary">{item.title}</span>
                <span className="mt-0.5 block text-sm text-text-secondary">{item.detail}</span>
                <span className={item.complete ? 'mt-1 block text-sm font-medium text-success sm:hidden' : 'mt-1 block text-sm font-medium text-warning sm:hidden'}>
                  {item.complete ? 'Configurado' : 'Revisar'}
                </span>
              </span>
              <span className={item.complete ? 'hidden text-success sm:inline' : 'hidden text-warning sm:inline'}>
                {item.complete ? 'Configurado' : 'Revisar'}
              </span>
              <ArrowRight className="shrink-0 text-text-muted" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
