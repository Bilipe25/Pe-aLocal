import 'server-only';

import { diningTableTokenFingerprint } from '@/domain/dining-tables';
import {
  isMercadoPagoEnabled,
  isMercadoPagoOrdersCredentialReady,
} from '@/lib/mercado-pago/config';
import { getPublicStoreBySlug } from '@/server/queries/public-store';
import { resolveDiningTableContext } from '@/server/services/dining-table.service';

export async function getDineInStorefrontContext(tableToken: string) {
  const table = await resolveDiningTableContext(tableToken);
  if (!table) return { state: 'INVALID' as const };

  const store = await getPublicStoreBySlug(table.store.slug);
  if (!store || store.id !== table.storeId || store.tenantId !== table.tenantId) {
    return { state: 'INVALID' as const };
  }
  if (!table.store.entitlement?.dineInQrEnabled) {
    return { state: 'DISABLED' as const, store };
  }
  if (!table.isActive) return { state: 'INACTIVE' as const, store };

  const onlinePixAvailable = Boolean(
    isMercadoPagoEnabled() &&
      isMercadoPagoOrdersCredentialReady() &&
      table.store.entitlement?.onlinePaymentsEnabled &&
      table.store.settings?.paymentMode === 'ONLINE' &&
      table.store.paymentProviderConnections.length > 0,
  );
  const onlinePix = onlinePixAvailable
    ? ({
        method: 'PIX',
        processing: 'ONLINE',
        provider: 'MERCADO_PAGO',
        requiresEmail: true,
        environment: process.env.APP_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX',
      } as const)
    : null;
  const paymentMethods = [
    onlinePix ?? null,
    table.store.settings?.acceptsCash
      ? ({ method: 'CASH', processing: 'MANUAL' } as const)
      : null,
    table.store.settings?.acceptsCardInPerson
      ? ({ method: 'CARD_IN_PERSON', processing: 'MANUAL' } as const)
      : null,
  ].filter((method) => method !== null);

  return {
    state: 'READY' as const,
    table: {
      id: table.id,
      label: table.label,
      version: table.version,
    },
    store,
    cartScopeId: `${store.id}:dine:${diningTableTokenFingerprint(tableToken)}`,
    paymentMethods,
  };
}
