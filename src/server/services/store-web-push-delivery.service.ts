import type { PrismaClient } from '@prisma/client';

import { orderEventPayloadSchema } from '@/domain/orders/order-events';
import { shouldNotifyStoreAboutNewOrder } from '@/domain/orders/store-order-notification';
import {
  buildMerchantNewOrderNotification,
  buildMerchantTestNotification,
} from '@/lib/web-push/merchant-notification';
import {
  countAuthorizedPendingStoreOrders,
  findAuthorizedStoreStaffPushAssociations,
  isStoreStaffPushAssociationAuthorized,
} from '@/server/services/store-staff-push-access';
import { revokeWebPushSubscription } from '@/server/services/web-push-revocation.service';
import {
  sendWebPushNotification,
  webPushFailure,
  type WebPushSenderConfig,
} from '@/server/services/web-push-sender';
import { resolveWebPushStoreIdentity } from '@/server/services/web-push-store-identity.service';

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

async function finishDelivery(
  db: PrismaClient,
  deliveryId: string,
  lockToken: string,
  status: 'SENT' | 'SKIPPED',
  reason?: string,
) {
  await db.storeWebPushDelivery.updateMany({
    where: { id: deliveryId, status: 'PROCESSING', lockToken },
    data: {
      status,
      sentAt: status === 'SENT' ? new Date() : null,
      failedAt: status === 'SKIPPED' ? new Date() : null,
      lastStatusCode: status === 'SENT' ? 201 : null,
      lastError: reason ?? null,
      lockedAt: null,
      lockToken: null,
    },
  });
}

async function processDelivery(db: PrismaClient, config: WebPushSenderConfig, deliveryId: string) {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  const [claim] = await db.storeWebPushDelivery.updateManyAndReturn({
    where: {
      id: deliveryId,
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }],
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: now, lockToken },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderId: true,
      orderOutboxEventId: true,
      storeStaffPushSubscriptionId: true,
      webPushSubscriptionId: true,
      aggregateVersion: true,
      attempts: true,
    },
  });
  if (!claim) return 'contended' as const;

  const groupLock = await db.storeStaffPushSubscription.updateMany({
    where: {
      id: claim.storeStaffPushSubscriptionId,
      disabledAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }],
    },
    data: { lockedAt: now, lockToken },
  });
  if (groupLock.count !== 1) {
    await db.storeWebPushDelivery.updateMany({
      where: { id: claim.id, lockToken },
      data: {
        status: 'PENDING',
        attempts: { decrement: 1 },
        availableAt: new Date(Date.now() + 5_000),
        lockedAt: null,
        lockToken: null,
      },
    });
    return 'contended' as const;
  }

  try {
    const [association, order, event] = await Promise.all([
      db.storeStaffPushSubscription.findUnique({
        where: { id: claim.storeStaffPushSubscriptionId },
        include: {
          membership: { include: { tenant: true, user: true } },
          store: true,
          subscription: true,
        },
      }),
      db.order.findUnique({
        where: { id: claim.orderId },
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderNumber: true,
          total: true,
          modality: true,
          status: true,
          paymentStatus: true,
          version: true,
          items: { select: { quantity: true } },
        },
      }),
      db.orderOutboxEvent.findUnique({
        where: { id: claim.orderOutboxEventId },
        select: { eventType: true, tenantId: true, storeId: true, orderId: true, payload: true },
      }),
    ]);

    const payload = event ? orderEventPayloadSchema.safeParse(event.payload) : null;
    const authorized = association && isStoreStaffPushAssociationAuthorized(association, now);
    const actionable = Boolean(
      order &&
      event &&
      payload?.success &&
      order.version >= claim.aggregateVersion &&
      shouldNotifyStoreAboutNewOrder({
        eventType: event.eventType,
        eventStatus: payload.data.status,
        currentStatus: order.status,
        paymentStatus: order.paymentStatus,
        eventOrderId: event.orderId,
        currentOrderId: order.id,
        eventStoreId: event.storeId,
        currentStoreId: order.storeId,
        eventTenantId: event.tenantId,
        currentTenantId: order.tenantId,
      }),
    );

    if (!association || !authorized || !order || !actionable) {
      if (association && !authorized && !association.disabledAt) {
        await db.storeStaffPushSubscription.updateMany({
          where: { id: association.id, disabledAt: null },
          data: {
            disabledAt: now,
            disabledReason: 'authorization_revoked',
            lockedAt: null,
            lockToken: null,
          },
        });
      }
      await finishDelivery(db, claim.id, lockToken, 'SKIPPED', 'merchant_push_stale');
      return 'skipped' as const;
    }

    const [identity, pendingActionableCount, activeAssociations] = await Promise.all([
      resolveWebPushStoreIdentity(db, claim.tenantId, claim.storeId),
      countAuthorizedPendingStoreOrders(db, association.userId, claim.webPushSubscriptionId),
      findAuthorizedStoreStaffPushAssociations(db, association.userId, claim.webPushSubscriptionId),
    ]);
    if (!identity) {
      await finishDelivery(db, claim.id, lockToken, 'SKIPPED', 'merchant_push_store_missing');
      return 'skipped' as const;
    }

    const notification = await buildMerchantNewOrderNotification({
      eventId: claim.orderOutboxEventId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderVersion: claim.aggregateVersion,
      storeId: order.storeId,
      storeName: identity.name,
      origin: association.subscription.origin,
      total: order.total,
      modality: order.modality,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      includeStoreName: new Set(activeAssociations.map((item) => item.storeId)).size > 1,
      pendingActionableCount,
      iconAssetId: identity.iconAssetId,
    });
    await sendWebPushNotification(config, {
      endpoint: association.subscription.endpoint,
      p256dh: association.subscription.p256dh,
      auth: association.subscription.auth,
      payload: notification.payload,
      topic: notification.topic,
      ttlSeconds: 120,
      urgency: 'high',
    });
    await finishDelivery(db, claim.id, lockToken, 'SENT');
    return 'sent' as const;
  } catch (error) {
    const failure = webPushFailure(error);
    if (failure.revoked) {
      await revokeWebPushSubscription(
        db,
        claim.webPushSubscriptionId,
        `push_${failure.statusCode}`,
        failure.statusCode,
      );
      return 'revoked' as const;
    }
    const exhausted = !failure.transient || claim.attempts >= MAX_ATTEMPTS;
    const retrySeconds = Math.min(
      300,
      failure.retryAfterSeconds ?? retryDelaySeconds(claim.attempts),
    );
    await db.storeWebPushDelivery.updateMany({
      where: { id: claim.id, status: 'PROCESSING', lockToken },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        failedAt: exhausted ? new Date() : null,
        availableAt: new Date(Date.now() + retrySeconds * 1_000),
        lockedAt: null,
        lockToken: null,
        lastStatusCode: failure.statusCode,
        lastError: failure.message,
      },
    });
    return exhausted ? ('failed' as const) : ('retry' as const);
  } finally {
    await db.storeStaffPushSubscription.updateMany({
      where: { id: claim.storeStaffPushSubscriptionId, lockToken },
      data: { lockedAt: null, lockToken: null },
    });
  }
}

async function processCandidates(
  db: PrismaClient,
  config: WebPushSenderConfig,
  where: { orderOutboxEventId?: string },
  batchSize: number,
) {
  const candidates = await db.storeWebPushDelivery.findMany({
    where: {
      ...where,
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: new Date() },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - CLAIM_TIMEOUT_MS) } }],
    },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  const outcomes: Record<string, number> = {};
  for (const candidate of candidates) {
    const outcome = await processDelivery(db, config, candidate.id);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { candidates: candidates.length, outcomes };
}

export function processPendingStoreWebPushDeliveries(
  db: PrismaClient,
  config: WebPushSenderConfig,
  batchSize = 25,
) {
  return processCandidates(db, config, {}, batchSize);
}

export function processStoreWebPushDeliveriesForEvent(
  db: PrismaClient,
  config: WebPushSenderConfig,
  orderOutboxEventId: string,
  batchSize = 10,
) {
  return processCandidates(db, config, { orderOutboxEventId }, batchSize);
}

export async function sendStoreStaffPushTest(
  db: PrismaClient,
  config: WebPushSenderConfig,
  associationId: string,
) {
  const association = await db.storeStaffPushSubscription.findUnique({
    where: { id: associationId },
    include: {
      membership: { include: { tenant: true, user: true } },
      store: true,
      subscription: true,
    },
  });
  if (!association || !isStoreStaffPushAssociationAuthorized(association)) {
    return { sent: false, reason: 'unauthorized' } as const;
  }
  const notification = buildMerchantTestNotification(association.subscription.origin);
  try {
    await sendWebPushNotification(config, {
      endpoint: association.subscription.endpoint,
      p256dh: association.subscription.p256dh,
      auth: association.subscription.auth,
      payload: notification.payload,
      topic: notification.topic,
      ttlSeconds: 60,
      urgency: 'normal',
    });
    return { sent: true } as const;
  } catch (error) {
    const failure = webPushFailure(error);
    if (failure.revoked) {
      await revokeWebPushSubscription(
        db,
        association.webPushSubscriptionId,
        `push_${failure.statusCode}`,
        failure.statusCode,
      );
    }
    return { sent: false, reason: failure.message } as const;
  }
}
