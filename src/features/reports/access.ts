import 'server-only';

import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import type { ReportsServiceContext } from '@/server/services/reports.service';

export async function requireAdvancedReportsContext() {
  const context = await requireActiveStoreContext(Permission.VIEW_REPORTS);
  if (!context.store.entitlement?.advancedReportsEnabled) {
    throw new AuthorizationError('Os relatórios avançados não estão habilitados para esta loja.');
  }

  const reportsContext: ReportsServiceContext = {
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    timeZone: context.store.timeZone,
    operationalSlaEnabled: context.store.entitlement.operationalSlaEnabled,
  };
  return { context, reportsContext };
}
