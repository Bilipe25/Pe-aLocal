import 'server-only';

import { Prisma } from '@prisma/client';

import {
  deriveCustomerRelationshipSegment,
  isRelationshipAttentionSegment,
  RELATIONSHIP_DAY_MS,
} from '@/domain/customers/relationship';
import { getDb } from '@/server/database/client';
import { isTenantAdmin, Permission } from '@/server/permissions';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

type RelationshipTx = Prisma.TransactionClient;

async function eligibleOrder(
  tx: RelationshipTx,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  return tx.order.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
    },
    select: {
      id: true,
      total: true,
      deliveredAt: true,
      statusChangedAt: true,
      customer: {
        select: {
          id: true,
          consumerIdentityId: true,
          consumerIdentityLinkProof: true,
          consumerIdentity: {
            select: { id: true, emailVerifiedAt: true, phoneVerifiedAt: true },
          },
        },
      },
    },
  });
}

async function attributeCompletedOrderToReturnCampaigns(
  tx: RelationshipTx,
  input: {
    tenantId: string;
    storeId: string;
    consumerIdentityId: string;
    orderId: string;
    orderValue: number;
    completedAt: Date;
  },
) {
  const recipients = await tx.customerReturnCampaignRecipient.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: input.consumerIdentityId,
      createdAt: { lte: input.completedAt },
      campaign: {
        status: 'ACTIVE',
        startsAt: { lte: input.completedAt },
        endsAt: { gte: input.completedAt },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 5,
    select: {
      id: true,
      campaignId: true,
      status: true,
      reward: { select: { orderId: true, status: true } },
    },
  });
  let attributed = 0;
  for (const recipient of recipients) {
    const usedReward =
      recipient.reward.orderId === input.orderId && recipient.reward.status === 'REDEEMED';
    const created = await tx.customerReturnCampaignOrder.createMany({
      data: [
        {
          tenantId: input.tenantId,
          storeId: input.storeId,
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          orderId: input.orderId,
          orderValue: input.orderValue,
          usedReward,
          completedAt: input.completedAt,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 0) continue;
    attributed += 1;
    const recipientStatus =
      usedReward || recipient.status === 'CONVERTED' ? 'CONVERTED' : 'RETURNED';
    await tx.customerReturnCampaignRecipient.updateMany({
      where: { id: recipient.id, tenantId: input.tenantId, storeId: input.storeId },
      data: {
        status: recipientStatus,
        convertedAt: usedReward ? input.completedAt : undefined,
      },
    });
    await tx.customerReturnCampaignRecipient.updateMany({
      where: {
        id: recipient.id,
        tenantId: input.tenantId,
        storeId: input.storeId,
        firstReturnedAt: null,
      },
      data: { firstReturnedAt: input.completedAt },
    });
    if (usedReward) {
      console.info(JSON.stringify({ event: 'return_campaign_converted', storeId: input.storeId }));
    }
  }
  return attributed;
}

function nextAverageDays(input: {
  previousCount: number;
  previousAverageDays: number | null;
  previousLastOrderAt: Date;
  completedAt: Date;
}) {
  const gapDays = Math.max(
    0,
    (input.completedAt.getTime() - input.previousLastOrderAt.getTime()) / RELATIONSHIP_DAY_MS,
  );
  const previousIntervals = Math.max(0, input.previousCount - 1);
  return (
    ((input.previousAverageDays ?? 0) * previousIntervals + gapDays) /
    Math.max(1, input.previousCount)
  );
}

async function rebuildSnapshotMetrics(tx: RelationshipTx, snapshotId: string, referenceAt: Date) {
  const orders = await tx.customerRelationshipProcessedOrder.findMany({
    where: { snapshotId },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
    select: { completedAt: true, orderValue: true },
  });
  const totalCompletedOrderValue = orders.reduce((sum, order) => sum + order.orderValue, 0);
  const intervalTotal = orders.slice(1).reduce((sum, order, index) => {
    const previous = orders[index];
    return previous
      ? sum + Math.max(0, order.completedAt.getTime() - previous.completedAt.getTime())
      : sum;
  }, 0);
  return {
    completedOrderCount: orders.length,
    totalCompletedOrderValue,
    averageOrderValue: orders.length ? Math.round(totalCompletedOrderValue / orders.length) : 0,
    firstCompletedOrderAt: orders[0]?.completedAt ?? referenceAt,
    lastCompletedOrderAt: orders.at(-1)?.completedAt ?? referenceAt,
    averageDaysBetweenOrders:
      orders.length > 1 ? intervalTotal / (orders.length - 1) / RELATIONSHIP_DAY_MS : null,
    recentOrderFrequency: orders.filter(
      (order) => order.completedAt >= new Date(referenceAt.getTime() - 30 * RELATIONSHIP_DAY_MS),
    ).length,
  };
}

export async function processCustomerRelationshipForOrder(
  tx: RelationshipTx,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const order = await eligibleOrder(tx, input);
  const identity = order?.customer?.consumerIdentity;
  if (
    !order ||
    !order.customer?.consumerIdentityId ||
    !order.customer.consumerIdentityLinkProof ||
    !identity ||
    (!identity.emailVerifiedAt && !identity.phoneVerifiedAt)
  ) {
    return { updated: false as const, reason: 'identity_not_verified' as const };
  }

  const entitlement = await tx.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityEnabled: true,
      customerRelationshipEnabled: true,
    },
    select: { id: true },
  });
  if (!entitlement) return { updated: false as const, reason: 'disabled' as const };

  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`relationship:${input.storeId}:${identity.id}`}, 0))`,
  );
  const duplicate = await tx.customerRelationshipProcessedOrder.findFirst({
    where: { tenantId: input.tenantId, storeId: input.storeId, orderId: input.orderId },
    select: { id: true },
  });
  if (duplicate) return { updated: false as const, reason: 'already_processed' as const };

  const completedAt = order.deliveredAt ?? order.statusChangedAt;
  let snapshot = await tx.customerRelationshipSnapshot.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityId: identity.id,
    },
  });

  if (!snapshot) {
    snapshot = await tx.customerRelationshipSnapshot.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        consumerIdentityId: identity.id,
        customerId: order.customer.id,
        firstCompletedOrderAt: completedAt,
        lastCompletedOrderAt: completedAt,
        completedOrderCount: 1,
        totalCompletedOrderValue: order.total,
        averageOrderValue: order.total,
        averageDaysBetweenOrders: null,
        recentOrderFrequency: 1,
        segment: 'NEW',
        segmentUpdatedAt: completedAt,
      },
    });
    await tx.customerRelationshipProcessedOrder.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        snapshotId: snapshot.id,
        consumerIdentityId: identity.id,
        orderId: input.orderId,
        completedAt,
        orderValue: order.total,
      },
    });
  } else {
    const previousSegment = deriveCustomerRelationshipSegment({
      completedOrderCount: snapshot.completedOrderCount,
      lastCompletedOrderAt: snapshot.lastCompletedOrderAt,
      averageDaysBetweenOrders: snapshot.averageDaysBetweenOrders,
      recoveredAt: snapshot.recoveredAt,
      now: completedAt,
    });
    await tx.customerRelationshipProcessedOrder.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        snapshotId: snapshot.id,
        consumerIdentityId: identity.id,
        orderId: input.orderId,
        completedAt,
        orderValue: order.total,
      },
    });
    const chronological = completedAt >= snapshot.lastCompletedOrderAt;
    const metrics = chronological
      ? {
          completedOrderCount: snapshot.completedOrderCount + 1,
          totalCompletedOrderValue: snapshot.totalCompletedOrderValue + order.total,
          averageOrderValue: Math.round(
            (snapshot.totalCompletedOrderValue + order.total) / (snapshot.completedOrderCount + 1),
          ),
          firstCompletedOrderAt: snapshot.firstCompletedOrderAt,
          lastCompletedOrderAt: completedAt,
          averageDaysBetweenOrders: nextAverageDays({
            previousCount: snapshot.completedOrderCount,
            previousAverageDays: snapshot.averageDaysBetweenOrders,
            previousLastOrderAt: snapshot.lastCompletedOrderAt,
            completedAt,
          }),
          recentOrderFrequency: await tx.customerRelationshipProcessedOrder.count({
            where: {
              snapshotId: snapshot.id,
              completedAt: { gte: new Date(completedAt.getTime() - 30 * RELATIONSHIP_DAY_MS) },
            },
          }),
        }
      : await rebuildSnapshotMetrics(tx, snapshot.id, completedAt);
    const recoveredAt = isRelationshipAttentionSegment(previousSegment)
      ? completedAt
      : snapshot.recoveredAt;
    const nextSegment = deriveCustomerRelationshipSegment({
      completedOrderCount: metrics.completedOrderCount,
      lastCompletedOrderAt: metrics.lastCompletedOrderAt,
      averageDaysBetweenOrders: metrics.averageDaysBetweenOrders,
      recoveredAt,
      now: completedAt,
    });
    snapshot = await tx.customerRelationshipSnapshot.update({
      where: { id: snapshot.id },
      data: {
        customerId: order.customer.id,
        ...metrics,
        recoveredAt,
        segment: nextSegment,
        segmentUpdatedAt: completedAt,
      },
    });
    if (nextSegment !== previousSegment) {
      console.info(
        JSON.stringify({
          event: 'relationship_segment_changed',
          storeId: input.storeId,
          from: previousSegment,
          to: nextSegment,
        }),
      );
    }
    if (recoveredAt === completedAt) {
      console.info(JSON.stringify({ event: 'customer_recovered', storeId: input.storeId }));
    }
  }

  const attributedCampaigns = await attributeCompletedOrderToReturnCampaigns(tx, {
    tenantId: input.tenantId,
    storeId: input.storeId,
    consumerIdentityId: identity.id,
    orderId: input.orderId,
    orderValue: order.total,
    completedAt,
  });
  return {
    updated: true as const,
    snapshotId: snapshot.id,
    segment: snapshot.segment,
    attributedCampaigns,
  };
}

export async function processClaimedDeliveredRelationshipOrders(
  tx: RelationshipTx,
  input: { tenantId: string; storeId: string; customerId: string },
) {
  const entitlement = await tx.storeEntitlement.findFirst({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      consumerIdentityEnabled: true,
      customerRelationshipEnabled: true,
    },
    select: { id: true },
  });
  if (!entitlement) return { processed: 0 };
  const orders = await tx.order.findMany({
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      customerId: input.customerId,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      customerRelationshipProcessing: null,
    },
    orderBy: [{ deliveredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  let processed = 0;
  for (const order of orders) {
    const result = await processCustomerRelationshipForOrder(tx, { ...input, orderId: order.id });
    if (result.updated) processed += 1;
  }
  return { processed };
}

export async function refreshCustomerRelationshipSegments(input: {
  tenantId: string;
  storeId: string;
}) {
  const db = getDb();
  return db.$executeRaw(Prisma.sql`
    WITH evaluated AS (
      SELECT snapshot.id,
        CASE
          WHEN snapshot."recoveredAt" IS NOT NULL
            AND snapshot."recoveredAt" > CURRENT_TIMESTAMP - INTERVAL '30 days'
            THEN 'RECOVERED'::"CustomerRelationshipSegment"
          WHEN floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - snapshot."lastCompletedOrderAt")) / 86400) >=
            CASE
              WHEN snapshot."completedOrderCount" >= 3 AND snapshot."averageDaysBetweenOrders" > 0
                THEN GREATEST(14, CEIL(snapshot."averageDaysBetweenOrders" * 2.5))
              ELSE 30
            END
            THEN 'INACTIVE'::"CustomerRelationshipSegment"
          WHEN floor(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - snapshot."lastCompletedOrderAt")) / 86400) >=
            CASE
              WHEN snapshot."completedOrderCount" >= 3 AND snapshot."averageDaysBetweenOrders" > 0
                THEN GREATEST(7, CEIL(snapshot."averageDaysBetweenOrders" * 1.5))
              ELSE 21
            END
            THEN 'COOLING'::"CustomerRelationshipSegment"
          WHEN snapshot."completedOrderCount" = 1 THEN 'NEW'::"CustomerRelationshipSegment"
          WHEN snapshot."completedOrderCount" = 2 THEN 'RETURNING'::"CustomerRelationshipSegment"
          WHEN snapshot."completedOrderCount" >= 5 AND snapshot."averageDaysBetweenOrders" <= 14
            THEN 'FREQUENT'::"CustomerRelationshipSegment"
          ELSE 'RECURRING'::"CustomerRelationshipSegment"
        END AS "nextSegment"
      FROM "customer_relationship_snapshots" snapshot
      WHERE snapshot."tenantId" = ${input.tenantId}
        AND snapshot."storeId" = ${input.storeId}
    )
    UPDATE "customer_relationship_snapshots" snapshot
    SET "segment" = evaluated."nextSegment",
        "segmentUpdatedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM evaluated
    WHERE snapshot.id = evaluated.id
      AND snapshot."segment" IS DISTINCT FROM evaluated."nextSegment"
  `);
}

export async function getCustomerRelationshipHomeInsights() {
  const context = await requireActiveStoreContext(Permission.VIEW_CUSTOMER_CONTACT);
  if (
    !isTenantAdmin(context.session.tenantRole) ||
    !context.store.entitlement?.customerRelationshipEnabled ||
    !context.store.entitlement.consumerIdentityEnabled
  ) {
    return null;
  }
  const tenantId = context.session.tenantId;
  const storeId = context.store.id;
  await refreshCustomerRelationshipSegments({ tenantId, storeId });
  const [attention, nearRewardRows] = await Promise.all([
    getDb().customerRelationshipSnapshot.count({
      where: { tenantId, storeId, segment: { in: ['COOLING', 'INACTIVE'] } },
    }),
    context.store.entitlement.loyaltyEnabled
      ? getDb().$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM loyalty_cycles
          WHERE "tenantId" = ${tenantId}
            AND "storeId" = ${storeId}
            AND status = 'ACTIVE'::"LoyaltyCycleStatus"
            AND progress = "requiredOrders" - 1
        `)
      : Promise.resolve([]),
  ]);
  return { attention, nearReward: Number(nearRewardRows[0]?.count ?? 0) };
}
