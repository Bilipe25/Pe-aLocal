'use server';

import { actionError, actionSuccess, AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { getKdsSnapshot } from '@/server/services/kds-query.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export async function getKdsSnapshotAction() {
  try {
    const context = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    if (!context.store.entitlement?.kdsEnabled) {
      throw new AuthorizationError('A Tela da cozinha não está habilitada para esta loja.');
    }
    return actionSuccess(
      await getKdsSnapshot({
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        estimatedTimeMaxMinutes: context.store.settings?.estimatedTimeMaxMinutes ?? 50,
      }),
    );
  } catch (error) {
    return actionError(error);
  }
}
