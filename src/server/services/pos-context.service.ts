import 'server-only';

import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export async function requirePosContext() {
  const context = await requireActiveStoreContext(Permission.OPERATE_POS);
  if (!context.store.entitlement?.posEnabled) {
    throw new AuthorizationError('O PDV não está habilitado para esta loja.');
  }
  return context;
}

export type PosContext = Awaited<ReturnType<typeof requirePosContext>>;
