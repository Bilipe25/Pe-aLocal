import Link from 'next/link';
import { ArrowRight, Clock3, ExternalLink, Settings, Truck, UtensilsCrossed } from 'lucide-react';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { listCategoriesAction, listProductsAction } from '@/features/catalog/actions';
import { listDeliveryZonesAction } from '@/features/delivery/actions';
import { getActiveOrderCountsAction } from '@/features/orders/query-actions';
import { getActiveStoreContext } from '@/server/services/store-context.service';
import { getStoreOverview } from '@/server/services/store-settings.service';

export const metadata = {
  title: 'Visão geral',
  description: 'Painel administrativo do seu estabelecimento.',
};

export default async function DashboardPage() {
  const activeStore = await getActiveStoreContext();
  if (!activeStore) redirect('/dashboard/stores');

  const [overview, categories, products, zones, ordersResult] = await Promise.all([
    getStoreOverview(activeStore.store.id),
    listCategoriesAction(),
    listProductsAction(),
    listDeliveryZonesAction(),
    getActiveOrderCountsAction(),
  ]);
  const store = overview.store;
  const activeHours = store.openingHours.length;
  const ordersAvailable = ordersResult.success;
  const activeOrders = ordersResult.success ? ordersResult.data.total : 0;
  const waitingOrders = ordersResult.success ? ordersResult.data.pending : 0;
  const preparingOrders = ordersResult.success ? ordersResult.data.preparing : 0;
  const readyOrders = ordersResult.success ? ordersResult.data.ready : 0;
  const setupComplete = [
    categories.length > 0 && products.length > 0,
    zones.length > 0,
    activeHours > 0 && Boolean(store.address),
  ].filter(Boolean).length;

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
      href: `/dashboard/stores/${store.id}`,
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

      <section
        className="bg-text-primary text-surface overflow-hidden rounded-xl"
        aria-labelledby="shift-heading"
      >
        <div className="p-5 sm:flex sm:items-start sm:justify-between sm:gap-8 sm:p-6">
          <div>
            <div className="text-surface/80 flex items-center gap-2 text-sm font-medium">
              <Clock3 aria-hidden="true" /> Turno agora
            </div>
            <h2 id="shift-heading" className="mt-2 text-xl font-semibold">
              {!ordersAvailable
                ? 'Operação de pedidos indisponível'
                : activeOrders === 0
                ? 'Nenhum pedido aguardando ação'
                  : `${activeOrders} ${activeOrders === 1 ? 'pedido precisa' : 'pedidos precisam'} de acompanhamento`}
            </h2>
            <p className="text-surface/80 mt-2 max-w-2xl text-sm">
              {!ordersAvailable
                ? 'Não foi possível consultar a fila. Abra a central para tentar novamente.'
                : activeOrders === 0
                ? 'A central está pronta. Novos pedidos aparecerão em tempo real.'
                : 'Abra a central para priorizar os mais antigos e atualizar cada etapa.'}
            </p>
          </div>
          <Button asChild className="bg-brand-600 hover:bg-brand-700 mt-5 w-full sm:mt-0 sm:w-auto">
            <Link href="/dashboard/orders">
              Abrir central <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <dl className="grid border-t border-white/15 sm:grid-cols-3 sm:divide-x sm:divide-white/15">
          {[
            ['Aguardando atenção', ordersAvailable ? waitingOrders : '—'],
            ['Em preparo', ordersAvailable ? preparingOrders : '—'],
            ['Prontos para sair', ordersAvailable ? readyOrders : '—'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-white/15 px-5 py-3 last:border-b-0 sm:block sm:border-b-0 sm:px-6"
            >
              <dt className="text-surface/75 text-sm">{label}</dt>
              <dd className="text-surface font-mono text-lg font-bold sm:mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8" aria-labelledby="setup-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="setup-heading" className="text-text-primary text-lg font-semibold">
              Pronto para vender
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              {setupComplete} de 3 etapas essenciais revisadas.
            </p>
          </div>
        </div>
        <div className="divide-border border-border bg-surface divide-y overflow-hidden rounded-xl border">
          {setupItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-surface-secondary flex min-h-20 items-center gap-3 px-4 py-3 transition-colors sm:px-5"
            >
              <span className="bg-brand-50 text-brand-700 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
                <item.icon aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-text-primary font-semibold">{item.title}</span>
                <span className="text-text-secondary mt-0.5 block text-sm">{item.detail}</span>
                <span
                  className={
                    item.complete
                      ? 'text-success mt-1 block text-sm font-medium sm:hidden'
                      : 'text-warning mt-1 block text-sm font-medium sm:hidden'
                  }
                >
                  {item.complete ? 'Configurado' : 'Revisar'}
                </span>
              </span>
              <span
                className={
                  item.complete ? 'text-success hidden sm:inline' : 'text-warning hidden sm:inline'
                }
              >
                {item.complete ? 'Configurado' : 'Revisar'}
              </span>
              <ArrowRight className="text-text-muted shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
