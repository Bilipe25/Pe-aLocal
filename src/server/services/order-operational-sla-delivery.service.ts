import type { PrismaClient } from '@prisma/client';

import { ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES } from '@/domain/orders/operational-sla';
import { buildMerchantOperationalSlaNotification } from '@/lib/web-push/merchant-notification';
import {
  countAuthorizedPendingStoreOrders,
  findAuthorizedStoreStaffPushAssociations,
  isStoreStaffPushAssociationAuthorized,
} from '@/server/services/store-staff-push-access';
import {
  getWebPushRetryDelaySeconds,
  WEB_PUSH_DELIVERY_LEASE_MS,
  WEB_PUSH_MAX_DELIVERY_ATTEMPTS,
  WEB_PUSH_MAX_RETRY_DELAY_SECONDS,
} from '@/server/services/web-push-delivery-policy';
import { revokeWebPushSubscription } from '@/server/services/web-push-revocation.service';
import {
  sendWebPushNotification,
  webPushFailure,
  type WebPushSenderConfig,
} from '@/server/services/web-push-sender';
import { resolveWebPushStoreIdentity } from '@/server/services/web-push-store-identity.service';

export const ORDER_OPERATIONAL_SLA_DELIVERY_BATCH_SIZE = 25;

async function finishDelivery(
  db: PrismaClient,
  deliveryId: string,
  lockToken: string,
  status: 'SENT' | 'SKIPPED',
  reason?: string,
) {
  await db.orderOperationalSlaDelivery.updateMany({
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

async function resolveAlert(db: PrismaClient, alertId: string, now: Date) {
  await db.orderOperationalSlaAlert.updateMany({
    where: { id: alertId, resolvedAt: null },
    data: { resolvedAt: now },
  });
}

async function skipDelivery(
  db: PrismaClient,
  claim: { id: string; slaAlertId: string },
  lockToken: string,
  reason: string,
  logEvent: 'OPERATIONAL_SLA_SKIPPED_STALE' | 'OPERATIONAL_SLA_SKIPPED_DISABLED',
  context: Record<string, string | number>,
  resolve = false,
) {
  await finishDelivery(db, claim.id, lockToken, 'SKIPPED', reason);
  if (resolve) await resolveAlert(db, claim.slaAlertId, new Date());
  console.info(`[${logEvent}]`, { ...context, result: reason });
  return 'skipped' as const;
}

async function processDelivery(db: PrismaClient, config: WebPushSenderConfig, deliveryId: string) {
  const lockToken = crypto.randomUUID();
  const now = new Date();
  const [claim] = await db.orderOperationalSlaDelivery.updateManyAndReturn({
    where: {
      id: deliveryId,
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: WEB_PUSH_MAX_DELIVERY_ATTEMPTS },
      availableAt: { lte: now },
      alert: { resolvedAt: null },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(now.getTime() - WEB_PUSH_DELIVERY_LEASE_MS) } },
      ],
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lockedAt: now, lockToken },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderId: true,
      slaAlertId: true,
      storeStaffPushSubscriptionId: true,
      webPushSubscriptionId: true,
      attempts: true,
    },
  });
  if (!claim) return 'contended' as const;

  const groupLock = await db.storeStaffPushSubscription.updateMany({
    where: {
      id: claim.storeStaffPushSubscriptionId,
      disabledAt: null,
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(now.getTime() - WEB_PUSH_DELIVERY_LEASE_MS) } },
      ],
    },
    data: { lockedAt: now, lockToken },
  });
  if (groupLock.count !== 1) {
    await db.orderOperationalSlaDelivery.updateMany({
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
    const [association, order, alert] = await Promise.all([
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
          status: true,
          statusChangedAt: true,
          version: true,
          store: {
            select: {
              entitlement: {
                select: { operationalSlaEnabled: true, operationalSlaEnabledAt: true },
              },
            },
          },
        },
      }),
      db.orderOperationalSlaAlert.findUnique({
        where: { id: claim.slaAlertId },
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          orderId: true,
          actionableAt: true,
          stage: true,
          resolvedAt: true,
        },
      }),
    ]);

    const context = {
      deliveryId: claim.id,
      alertId: claim.slaAlertId,
      tenantId: claim.tenantId,
      storeId: claim.storeId,
      orderId: claim.orderId,
      stage: alert?.stage ?? 'UNKNOWN',
    };
    const authorized = association && isStoreStaffPushAssociationAuthorized(association, now);
    if (!association || !authorized) {
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
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_authorization_revoked',
        'OPERATIONAL_SLA_SKIPPED_STALE',
        context,
      );
    }

    if (!order || !alert) {
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_stale',
        'OPERATIONAL_SLA_SKIPPED_STALE',
        context,
        true,
      );
    }
    const entitlement = order.store.entitlement;
    if (
      !entitlement?.operationalSlaEnabled ||
      !entitlement.operationalSlaEnabledAt ||
      alert.actionableAt < entitlement.operationalSlaEnabledAt
    ) {
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_disabled',
        'OPERATIONAL_SLA_SKIPPED_DISABLED',
        context,
        true,
      );
    }

    const sameScope =
      alert.tenantId === claim.tenantId &&
      alert.storeId === claim.storeId &&
      alert.orderId === claim.orderId &&
      order.tenantId === claim.tenantId &&
      order.storeId === claim.storeId;
    const sameCycle = order.statusChangedAt.getTime() === alert.actionableAt.getTime();
    if (alert.resolvedAt || !sameScope || order.status !== 'PENDING' || !sameCycle) {
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_stale',
        'OPERATIONAL_SLA_SKIPPED_STALE',
        context,
        true,
      );
    }

    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.now() - alert.actionableAt.getTime()) / 60_000),
    );
    if (alert.stage === 'WARNING' && elapsedMinutes >= ORDER_OPERATIONAL_SLA_CRITICAL_MINUTES) {
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_superseded',
        'OPERATIONAL_SLA_SKIPPED_STALE',
        { ...context, elapsedMinutes },
        true,
      );
    }

    const [identity, pendingActionableCount, activeAssociations] = await Promise.all([
      resolveWebPushStoreIdentity(db, claim.tenantId, claim.storeId),
      countAuthorizedPendingStoreOrders(db, association.userId, claim.webPushSubscriptionId),
      findAuthorizedStoreStaffPushAssociations(db, association.userId, claim.webPushSubscriptionId),
    ]);
    if (!identity) {
      return skipDelivery(
        db,
        claim,
        lockToken,
        'operational_sla_store_missing',
        'OPERATIONAL_SLA_SKIPPED_STALE',
        context,
      );
    }

    const notification = await buildMerchantOperationalSlaNotification({
      alertId: alert.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderVersion: order.version,
      storeId: order.storeId,
      storeName: identity.name,
      origin: association.subscription.origin,
      includeStoreName: new Set(activeAssociations.map((item) => item.storeId)).size > 1,
      pendingActionableCount,
      iconAssetId: identity.iconAssetId,
      reminderStage: alert.stage,
      elapsedMinutes,
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
    console.info('[OPERATIONAL_SLA_PUSH_SENT]', { ...context, elapsedMinutes, result: 'sent' });
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
    const exhausted = !failure.transient || claim.attempts >= WEB_PUSH_MAX_DELIVERY_ATTEMPTS;
    const retrySeconds = Math.min(
      WEB_PUSH_MAX_RETRY_DELAY_SECONDS,
      failure.retryAfterSeconds ?? getWebPushRetryDelaySeconds(claim.attempts),
    );
    await db.orderOperationalSlaDelivery.updateMany({
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
    console.info('[OPERATIONAL_SLA_PUSH_RETRY]', {
      deliveryId: claim.id,
      alertId: claim.slaAlertId,
      tenantId: claim.tenantId,
      storeId: claim.storeId,
      orderId: claim.orderId,
      attempts: claim.attempts,
      retrySeconds,
      result: exhausted ? 'failed' : 'retry',
    });
    return exhausted ? ('failed' as const) : ('retry' as const);
  } finally {
    await db.storeStaffPushSubscription.updateMany({
      where: { id: claim.storeStaffPushSubscriptionId, lockToken },
      data: { lockedAt: null, lockToken: null },
    });
  }
}

export async function processPendingOrderOperationalSlaDeliveries(
  db: PrismaClient,
  config: WebPushSenderConfig,
  batchSize = ORDER_OPERATIONAL_SLA_DELIVERY_BATCH_SIZE,
) {
  const candidates = await db.orderOperationalSlaDelivery.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: WEB_PUSH_MAX_DELIVERY_ATTEMPTS },
      availableAt: { lte: new Date() },
      alert: { resolvedAt: null },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: new Date(Date.now() - WEB_PUSH_DELIVERY_LEASE_MS) } },
      ],
    },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(batchSize, ORDER_OPERATIONAL_SLA_DELIVERY_BATCH_SIZE)),
    select: { id: true },
  });
  const outcomes: Record<string, number> = {};
  for (const candidate of candidates) {
    const outcome = await processDelivery(db, config, candidate.id);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { candidates: candidates.length, outcomes };
}
