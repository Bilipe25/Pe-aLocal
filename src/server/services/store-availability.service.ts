import 'server-only';

import type { Prisma } from '@prisma/client';

import {
  evaluateEffectiveStoreAvailability,
  type EffectiveStoreAvailability,
} from '@/features/stores/availability';
import { getStoreReadinessStateForTenant } from '@/server/services/store-readiness.service';

type AvailabilityClient = Pick<Prisma.TransactionClient, 'store'>;

export async function getEffectiveStoreAvailabilityForTenant(
  tenantId: string,
  storeId: string,
  options: { now?: Date; client?: AvailabilityClient } = {},
): Promise<EffectiveStoreAvailability> {
  const { availability } = await getStoreAvailabilityStateForTenant(tenantId, storeId, options);
  return availability;
}

export async function getStoreAvailabilityStateForTenant(
  tenantId: string,
  storeId: string,
  options: { now?: Date; client?: AvailabilityClient } = {},
) {
  const { snapshot, readiness } = await getStoreReadinessStateForTenant(
    tenantId,
    storeId,
    options.client,
  );

  const availability = evaluateEffectiveStoreAvailability(
    {
      tenantStatus: snapshot.tenant.status,
      storeStatus: snapshot.status,
      isActive: snapshot.isActive,
      isReady: readiness.isReady,
      timeZone: snapshot.timeZone,
      openingHours: snapshot.openingHours,
      scheduleExceptions: snapshot.scheduleExceptions,
    },
    options.now,
  );

  return { snapshot, readiness, availability };
}
