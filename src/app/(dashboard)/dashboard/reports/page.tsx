import { redirect } from 'next/navigation';

import { requireAdvancedReportsContext } from '@/features/reports/access';
import { ReportsDashboard } from '@/features/reports/components/reports-dashboard';
import { AuthorizationError, TenantAccessError } from '@/server/errors';
import { getAdvancedReports } from '@/server/services/reports.service';

export const metadata = {
  title: 'Relatórios — PedidoLocal',
  description: 'Resumo avançado do movimento, produtos e operação da loja.',
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

  const initialData = await getAdvancedReports(reportsContext, { preset: 'LAST_7_DAYS' });
  return <ReportsDashboard initialData={initialData} />;
}
