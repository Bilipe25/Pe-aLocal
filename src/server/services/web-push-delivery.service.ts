import type { PrismaClient } from '@prisma/client';

import { buildWebPushNotification, type NotifiableOrderStatus } from '@/lib/web-push/notification';
import {
  sendWebPushNotification,
  webPushFailure,
  type WebPushSenderConfig,
} from '@/server/services/web-push-sender';
import { revokeWebPushSubscription } from '@/server/services/web-push-revocation.service';
import { resolveWebPushStoreIdentity } from '@/server/services/web-push-store-identity.service';

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

async function skipDelivery(
  db: PrismaClient,
  deliveryId: string,
  lockToken: string,
  reason: string,
) {
  await db.webPushDelivery.updateMany({
    where: { id: deliveryId, status: 'PROCESSING', lockToken },
    data: {
      status: 'SKIPPED',
      failedAt: new Date(),
      lastError: reason,
      lockedAt: null,
      lockToken: null,
    },
  });
}

async function processDelivery(db: PrismaClient, config: WebPushSenderConfig, deliveryId: string) {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  const [claim] = await db.webPushDelivery.updateManyAndReturn({
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
      orderPushSubscriptionId: true,
      webPushSubscriptionId: true,
      orderStatus: true,
      aggregateVersion: true,
      attempts: true,
    },
  });
  if (!claim) return 'contended' as const;

  const groupLock = await db.orderPushSubscription.updateMany({
    where: {
      id: claim.orderPushSubscriptionId,
      disabledAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }],
    },
    data: { lockedAt: now, lockToken },
  });
  if (groupLock.count !== 1) {
    await db.webPushDelivery.updateMany({
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
    const [association, order, newer] = await Promise.all([
      db.orderPushSubscription.findUnique({
        where: { id: claim.orderPushSubscriptionId },
        select: {
          disabledAt: true,
          terminalNotifiedAt: true,
          subscription: {
            select: {
              endpoint: true,
              p256dh: true,
              auth: true,
              origin: true,
              revokedAt: true,
              expirationTime: true,
            },
          },
        },
      }),
      db.order.findUnique({
        where: { id: claim.orderId },
        select: {
          status: true,
          version: true,
          modality: true,
          publicToken: true,
          store: { select: { name: true, slug: true, tenantId: true, id: true } },
        },
      }),
      db.webPushDelivery.findFirst({
        where: {
          orderPushSubscriptionId: claim.orderPushSubscriptionId,
          aggregateVersion: { gt: claim.aggregateVersion },
          status: { in: ['PENDING', 'PROCESSING', 'SENT'] },
        },
        select: { id: true },
      }),
    ]);

    if (!association || !order) {
      await skipDelivery(
        db,
        claim.id,
        lockToken,
        !association ? 'association_missing' : 'order_missing',
      );
      return 'skipped' as const;
    }

    const skipReason = association.disabledAt
      ? 'association_disabled'
      : association.subscription.revokedAt
        ? 'subscription_revoked'
        : association.subscription.expirationTime && association.subscription.expirationTime <= now
          ? 'subscription_expired'
          : newer
            ? 'newer_status_available'
            : order.status !== claim.orderStatus
              ? 'current_status_changed'
              : order.version < claim.aggregateVersion
                ? 'order_version_behind'
                : association.terminalNotifiedAt &&
                    ['DELIVERED', 'CANCELLED'].includes(claim.orderStatus)
                  ? 'terminal_already_notified'
                  : null;
    if (skipReason) {
      await skipDelivery(db, claim.id, lockToken, skipReason);
      return 'skipped' as const;
    }

    const [identity, activeMerchantAssociationCount] = await Promise.all([
      resolveWebPushStoreIdentity(db, claim.tenantId, claim.storeId),
      db.storeStaffPushSubscription.count({
        where: { webPushSubscriptionId: claim.webPushSubscriptionId, disabledAt: null },
      }),
    ]);
    const notification = await buildWebPushNotification({
      eventId: claim.orderOutboxEventId,
      orderId: claim.orderId,
      orderVersion: claim.aggregateVersion,
      storeName: order.store.name,
      storeSlug: order.store.slug,
      publicToken: order.publicToken,
      origin: association.subscription.origin,
      status: claim.orderStatus as NotifiableOrderStatus,
      modality: order.modality,
      iconAssetId: identity?.iconAssetId ?? null,
      preserveMerchantBadge: activeMerchantAssociationCount > 0,
    });
    await sendWebPushNotification(config, {
      endpoint: association.subscription.endpoint,
      p256dh: association.subscription.p256dh,
      auth: association.subscription.auth,
      payload: notification.payload,
      topic: notification.topic,
    });
    await db.$transaction([
      db.webPushDelivery.updateMany({
        where: { id: claim.id, status: 'PROCESSING', lockToken },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          lockedAt: null,
          lockToken: null,
          lastError: null,
          lastStatusCode: 201,
        },
      }),
      db.orderPushSubscription.updateMany({
        where: { id: claim.orderPushSubscriptionId, lockToken },
        data: {
          lockedAt: null,
          lockToken: null,
          terminalNotifiedAt: ['DELIVERED', 'CANCELLED'].includes(claim.orderStatus)
            ? new Date()
            : undefined,
        },
      }),
    ]);
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
    await db.$transaction([
      db.webPushDelivery.updateMany({
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
      }),
      db.orderPushSubscription.updateMany({
        where: { id: claim.orderPushSubscriptionId, lockToken },
        data: { lockedAt: null, lockToken: null },
      }),
    ]);
    return exhausted ? ('failed' as const) : ('retry' as const);
  } finally {
    await db.orderPushSubscription.updateMany({
      where: { id: claim.orderPushSubscriptionId, lockToken },
      data: { lockedAt: null, lockToken: null },
    });
  }
}

export async function processPendingWebPushDeliveries(
  db: PrismaClient,
  config: WebPushSenderConfig,
  batchSize = 25,
) {
  const candidates = await db.webPushDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: new Date() },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - CLAIM_TIMEOUT_MS) } }],
    },
    orderBy: [{ availableAt: 'asc' }, { aggregateVersion: 'desc' }, { id: 'asc' }],
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

export async function processWebPushDeliveriesForEvent(
  db: PrismaClient,
  config: WebPushSenderConfig,
  orderOutboxEventId: string,
  batchSize = 10,
) {
  const candidates = await db.webPushDelivery.findMany({
    where: {
      orderOutboxEventId,
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: new Date() },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - CLAIM_TIMEOUT_MS) } }],
    },
    orderBy: [{ aggregateVersion: 'desc' }, { id: 'asc' }],
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
