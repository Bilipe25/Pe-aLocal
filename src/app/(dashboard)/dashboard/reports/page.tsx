import { redirect } from 'next/navigation';

import { requireAdvancedReportsContext } from '@/features/reports/access';
import { ReportsDashboard } from '@/features/reports/components/reports-dashboard';
import { AuthorizationError, TenantAccessError } from '@/server/errors';
import { getAdvancedReports } from '@/server/services/reports.service';

export const metadata = {
  title: 'Relatórios — PedidoLocal',
  description: 'Entenda o que mudou no movimento, nos produtos e na operação da loja.',
};

export default async function ReportsPage() {
  let reportsContext;
  try {
    ({ reportsContext } = await requireAdvancedReportsContext());
  } catch (error) {
    if (error instanceof TenantAccessError) redirect('/dashboard/stores');
    if (error instanceof AuthorizationError) redirect('/dashboard');
    throw error;
  }

  const initialData = await getAdvancedReports(reportsContext, { preset: 'LAST_30_DAYS' });
  return <ReportsDashboard initialData={initialData} />;
}
