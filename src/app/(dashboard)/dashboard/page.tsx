import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
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

export const metadata = {
  title: 'Visão geral',
  description: 'Painel administrativo do seu estabelecimento.',
};

export default async function DashboardPage() {
  const activeStore = await getActiveStoreContext();
  if (!activeStore) redirect('/dashboard/stores');

  const localDate = getStoreLocalDate(new Date(), activeStore.store.timeZone);
  const [overview, ordersResult, metricsResult] = await Promise.all([
    getStoreOverview(activeStore.store.id),
    getActiveOrderCountsAction(),
    getDailyOrderMetricsAction({ localDate }),
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
    </div>
  );
}
