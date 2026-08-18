import type { PrismaClient } from '@prisma/client';

export async function revokeWebPushSubscription(
  db: PrismaClient,
  subscriptionId: string,
  reason: string,
  statusCode?: number | null,
) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.webPushSubscription.updateMany({
      where: { id: subscriptionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason.slice(0, 120) },
    });
    await tx.orderPushSubscription.updateMany({
      where: { webPushSubscriptionId: subscriptionId, disabledAt: null },
      data: { disabledAt: now, lockedAt: null, lockToken: null },
    });
    await tx.storeStaffPushSubscription.updateMany({
      where: { webPushSubscriptionId: subscriptionId, disabledAt: null },
      data: {
        disabledAt: now,
        disabledReason: reason.slice(0, 64),
        lockedAt: null,
        lockToken: null,
      },
    });
    await tx.webPushDelivery.updateMany({
      where: {
        webPushSubscriptionId: subscriptionId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'REVOKED',
        failedAt: now,
        lockedAt: null,
        lockToken: null,
        lastStatusCode: statusCode,
        lastError: 'push_subscription_revoked',
      },
    });
    await tx.storeWebPushDelivery.updateMany({
      where: {
        webPushSubscriptionId: subscriptionId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'REVOKED',
        failedAt: now,
        lockedAt: null,
        lockToken: null,
        lastStatusCode: statusCode,
        lastError: 'push_subscription_revoked',
      },
    });
    await tx.orderOperationalSlaDelivery.updateMany({
      where: {
        webPushSubscriptionId: subscriptionId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      data: {
        status: 'REVOKED',
        failedAt: now,
        lockedAt: null,
        lockToken: null,
        lastStatusCode: statusCode,
        lastError: 'push_subscription_revoked',
      },
    });
  });
}

export async function revokeExpiredWebPushSubscriptions(db: PrismaClient, batchSize = 100) {
  const expired = await db.webPushSubscription.findMany({
    where: { revokedAt: null, expirationTime: { lte: new Date() } },
    orderBy: [{ expirationTime: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  for (const subscription of expired) {
    await revokeWebPushSubscription(db, subscription.id, 'push_expired');
  }
  return { revoked: expired.length };
}
