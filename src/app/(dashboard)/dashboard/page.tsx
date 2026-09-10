import Link from 'next/link';
import { ExternalLink, Gift, UserRoundSearch } from 'lucide-react';
import { redirect } from 'next/navigation';

import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  getActiveOrderCountsAction,
  getDailyOrderMetricsAction,
} from '@/features/orders/query-actions';
import { getStoreLocalDate } from '@/lib/time/store-time';
import { getActiveStoreContext } from '@/server/services/store-context.service';
import { getStoreOverview } from '@/server/services/store-settings.service';
import { getCustomerRelationshipHomeInsights } from '@/server/services/customer-relationship.service';

export const metadata = {
  title: 'Visão geral',
  description: 'Painel administrativo do seu estabelecimento.',
};

export default async function DashboardPage() {
  const activeStore = await getActiveStoreContext();
  if (!activeStore) redirect('/dashboard/stores');

  const localDate = getStoreLocalDate(new Date(), activeStore.store.timeZone);
  const [overview, ordersResult, metricsResult, relationshipInsights] = await Promise.all([
    getStoreOverview(activeStore.store.id),
    getActiveOrderCountsAction(),
    getDailyOrderMetricsAction({ localDate }),
    getCustomerRelationshipHomeInsights(),
  ]);
  const store = overview.store;

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Acompanhe a operação e mantenha o estabelecimento pronto para receber pedidos."
        actions={
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href={`/${store.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" /> Ver cardápio
            </Link>
          </Button>
        }
      />
      <DashboardOverview
        store={{ id: store.id, name: store.name, slug: store.slug }}
        summary={overview.summary}
        readiness={overview.readiness}
        availability={overview.availability}
        orderCounts={ordersResult.success ? ordersResult.data : undefined}
        dailyMetrics={metricsResult.success ? metricsResult.data : undefined}
      />
      {relationshipInsights &&
      (relationshipInsights.attention > 0 || relationshipInsights.nearReward > 0) ? (
        <section
          className="border-border mt-6 divide-y rounded-xl border"
          aria-labelledby="customer-insights-title"
        >
          <h2 id="customer-insights-title" className="px-4 pt-4 pb-3 font-bold">
            Para cuidar hoje
          </h2>
          {relationshipInsights.attention > 0 ? (
            <Link
              href="/dashboard/customers?sort=ATTENTION"
              className="hover:bg-surface-secondary focus-visible:ring-brand-500 flex min-h-16 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <UserRoundSearch className="text-brand-600 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm">
                <strong className="block font-semibold">
                  {relationshipInsights.attention}{' '}
                  {relationshipInsights.attention === 1 ? 'cliente está' : 'clientes estão'} há mais
                  tempo sem voltar
                </strong>
                <span className="text-text-secondary">Ver quem precisa de atenção</span>
              </span>
            </Link>
          ) : null}
          {relationshipInsights.nearReward > 0 ? (
            <Link
              href="/dashboard/loyalty"
              className="hover:bg-surface-secondary focus-visible:ring-brand-500 flex min-h-16 items-center gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <Gift className="text-brand-600 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm">
                <strong className="block font-semibold">
                  {relationshipInsights.nearReward}{' '}
                  {relationshipInsights.nearReward === 1 ? 'cliente está' : 'clientes estão'} a um
                  pedido de ganhar um benefício
                </strong>
                <span className="text-text-secondary">Ver fidelidade</span>
              </span>
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
