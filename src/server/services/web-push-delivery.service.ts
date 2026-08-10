import type { PrismaClient } from '@prisma/client';

import { createCustomizationFromLegacy } from '@/features/customization/domain/defaults';
import { migrateCustomizationToCurrentVersion } from '@/features/customization/domain/migrations';
import { isInstallablePwaIconAsset } from '@/lib/pwa/manifest';
import {
  buildWebPushNotification,
  shouldNotifyOrderStatus,
  type NotifiableOrderStatus,
} from '@/lib/web-push/notification';
import {
  sendWebPushNotification,
  webPushFailure,
  type WebPushSenderConfig,
} from '@/server/services/web-push-sender';

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

async function resolveIconAssetId(
  db: PrismaClient,
  tenantId: string,
  storeId: string,
  ids: Array<{ id: string | null; assetType: 'FAVICON' | 'LOGO' }>,
) {
  for (const candidate of ids) {
    if (!candidate.id) continue;
    const asset = await db.storeAsset.findFirst({
      where: {
        id: candidate.id,
        tenantId,
        storeId,
        assetType: candidate.assetType,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, mimeType: true, width: true, height: true },
    });
    if (asset && isInstallablePwaIconAsset(asset)) return asset.id;
  }
  return null;
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
            select: { endpoint: true, p256dh: true, auth: true, origin: true, revokedAt: true },
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
          store: {
            select: {
              name: true,
              slug: true,
              tenantId: true,
              id: true,
              settings: { select: { primaryColor: true, secondaryColor: true, fontFamily: true } },
              customization: {
                select: { publishedConfig: true, publishedVersion: true, publishedAt: true },
              },
            },
          },
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

    if (
      !association ||
      association.disabledAt ||
      association.subscription.revokedAt ||
      !order ||
      newer ||
      order.status !== claim.orderStatus ||
      order.version < claim.aggregateVersion ||
      !shouldNotifyOrderStatus(claim.orderStatus as NotifiableOrderStatus, order.modality) ||
      (association.terminalNotifiedAt && ['DELIVERED', 'CANCELLED'].includes(claim.orderStatus))
    ) {
      await skipDelivery(db, claim.id, lockToken, 'delivery_superseded_or_disabled');
      return 'skipped' as const;
    }

    let customization;
    try {
      customization = migrateCustomizationToCurrentVersion(
        order.store.customization?.publishedConfig,
      );
    } catch {
      customization = createCustomizationFromLegacy({
        primaryColor: order.store.settings?.primaryColor,
        secondaryColor: order.store.settings?.secondaryColor,
        fontFamily: order.store.settings?.fontFamily,
      });
    }
    const iconAssetId = await resolveIconAssetId(db, claim.tenantId, claim.storeId, [
      { id: customization.identity.faviconAssetId, assetType: 'FAVICON' },
      { id: customization.identity.logoAssetId, assetType: 'LOGO' },
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
      iconAssetId,
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
      await db.$transaction([
        db.webPushSubscription.update({
          where: { id: claim.webPushSubscriptionId },
          data: { revokedAt: new Date(), revokedReason: `push_${failure.statusCode}` },
        }),
        db.orderPushSubscription.updateMany({
          where: { webPushSubscriptionId: claim.webPushSubscriptionId, disabledAt: null },
          data: { disabledAt: new Date(), lockedAt: null, lockToken: null },
        }),
        db.webPushDelivery.updateMany({
          where: {
            webPushSubscriptionId: claim.webPushSubscriptionId,
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: {
            status: 'REVOKED',
            failedAt: new Date(),
            lockedAt: null,
            lockToken: null,
            lastStatusCode: failure.statusCode,
            lastError: 'push_subscription_revoked',
          },
        }),
      ]);
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
