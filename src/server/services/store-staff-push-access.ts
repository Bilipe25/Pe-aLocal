import type { PrismaClient, TenantRole } from '@prisma/client';

import { hasTenantPermission, Permission } from '@/server/permissions';

export function hasStoreStaffPushPermission(role: TenantRole): boolean {
  return (
    hasTenantPermission(role, Permission.VIEW_ORDERS) &&
    hasTenantPermission(role, Permission.VIEW_ORDER_DETAILS)
  );
}

export function isStoreStaffPushAssociationAuthorized(
  input: {
    disabledAt: Date | null;
    membership: {
      isActive: boolean;
      role: TenantRole;
      tenant: { status: string };
      user: { isActive: boolean };
    };
    store: { isActive: boolean };
    subscription: { revokedAt: Date | null; expirationTime: Date | null };
  },
  now = new Date(),
): boolean {
  return Boolean(
    !input.disabledAt &&
    input.membership.isActive &&
    input.membership.user.isActive &&
    input.membership.tenant.status === 'ACTIVE' &&
    input.store.isActive &&
    !input.subscription.revokedAt &&
    (!input.subscription.expirationTime || input.subscription.expirationTime > now) &&
    hasStoreStaffPushPermission(input.membership.role),
  );
}

export async function findAuthorizedStoreStaffPushAssociations(
  db: PrismaClient,
  userId: string,
  webPushSubscriptionId: string,
) {
  const associations = await db.storeStaffPushSubscription.findMany({
    where: { userId, webPushSubscriptionId, disabledAt: null },
    include: {
      membership: { include: { tenant: true, user: true } },
      store: true,
      subscription: true,
    },
  });

  return associations.filter((association) => isStoreStaffPushAssociationAuthorized(association));
}

export async function countAuthorizedPendingStoreOrders(
  db: PrismaClient,
  userId: string,
  webPushSubscriptionId: string,
) {
  const associations = await findAuthorizedStoreStaffPushAssociations(
    db,
    userId,
    webPushSubscriptionId,
  );
  const scopes = [
    ...new Map(
      associations.map((association) => [
        `${association.tenantId}:${association.storeId}`,
        { tenantId: association.tenantId, storeId: association.storeId },
      ]),
    ).values(),
  ];

  if (!scopes.length) return 0;
  return db.order.count({ where: { status: 'PENDING', OR: scopes } });
}
