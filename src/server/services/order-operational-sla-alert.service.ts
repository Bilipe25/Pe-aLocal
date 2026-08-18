import { OrderOperationalSlaStage, Prisma, type PrismaClient } from '@prisma/client';

import { isStoreStaffPushAssociationAuthorized } from '@/server/services/store-staff-push-access';

export const ORDER_OPERATIONAL_SLA_ALERT_BATCH_SIZE = 100;

interface SlaCandidate {
  tenantId: string;
  storeId: string;
  orderId: string;
  actionableAt: Date;
  stage: OrderOperationalSlaStage;
}

async function findDueCandidates(db: PrismaClient, batchSize: number) {
  return db.$queryRaw<SlaCandidate[]>(Prisma.sql`
    SELECT
      orders."tenantId",
      orders."storeId",
      orders."id" AS "orderId",
      orders."statusChangedAt" AS "actionableAt",
      CASE
        WHEN orders."statusChangedAt" <= CURRENT_TIMESTAMP - INTERVAL '4 minutes'
          THEN 'CRITICAL'::"OrderOperationalSlaStage"
        ELSE 'WARNING'::"OrderOperationalSlaStage"
      END AS "stage"
    FROM "orders"
    INNER JOIN "stores"
      ON "stores"."id" = orders."storeId"
      AND "stores"."tenantId" = orders."tenantId"
    INNER JOIN "tenants"
      ON "tenants"."id" = orders."tenantId"
    INNER JOIN "store_entitlements" entitlements
      ON entitlements."storeId" = orders."storeId"
      AND entitlements."tenantId" = orders."tenantId"
    WHERE orders."status" = 'PENDING'
      AND "stores"."isActive" = true
      AND "tenants"."status" = 'ACTIVE'
      AND entitlements."operationalSlaEnabled" = true
      AND entitlements."operationalSlaEnabledAt" IS NOT NULL
      AND orders."statusChangedAt" >= entitlements."operationalSlaEnabledAt"
      AND orders."statusChangedAt" <= CURRENT_TIMESTAMP - INTERVAL '2 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM "order_operational_sla_alerts" alerts
        WHERE alerts."orderId" = orders."id"
          AND alerts."actionableAt" = orders."statusChangedAt"
          AND alerts."stage" = CASE
            WHEN orders."statusChangedAt" <= CURRENT_TIMESTAMP - INTERVAL '4 minutes'
              THEN 'CRITICAL'::"OrderOperationalSlaStage"
            ELSE 'WARNING'::"OrderOperationalSlaStage"
          END
      )
    ORDER BY orders."statusChangedAt" ASC, orders."id" ASC
    LIMIT ${batchSize}
  `);
}

async function createAlertAndFanOut(db: PrismaClient, candidate: SlaCandidate) {
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.orderOperationalSlaAlert.findUnique({
        where: {
          orderId_actionableAt_stage: {
            orderId: candidate.orderId,
            actionableAt: candidate.actionableAt,
            stage: candidate.stage,
          },
        },
        select: { id: true },
      });
      if (existing) return { created: false, deliveries: 0, alertId: existing.id };

      const alert = await tx.orderOperationalSlaAlert.create({
        data: candidate,
        select: { id: true },
      });
      const associations = await tx.storeStaffPushSubscription.findMany({
        where: {
          tenantId: candidate.tenantId,
          storeId: candidate.storeId,
          disabledAt: null,
        },
        include: {
          membership: { include: { tenant: true, user: true } },
          store: true,
          subscription: true,
        },
      });
      const authorized = associations.filter((association) =>
        isStoreStaffPushAssociationAuthorized(association),
      );
      const deliveries = [
        ...new Map(
          authorized.map((association) => [association.webPushSubscriptionId, association]),
        ).values(),
      ];
      if (deliveries.length) {
        await tx.orderOperationalSlaDelivery.createMany({
          data: deliveries.map((association) => ({
            tenantId: candidate.tenantId,
            storeId: candidate.storeId,
            orderId: candidate.orderId,
            slaAlertId: alert.id,
            storeStaffPushSubscriptionId: association.id,
            webPushSubscriptionId: association.webPushSubscriptionId,
          })),
          skipDuplicates: true,
        });
      }
      return { created: true, deliveries: deliveries.length, alertId: alert.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { created: false, deliveries: 0, alertId: null };
    }
    throw error;
  }
}

export async function reconcileOrderOperationalSlaAlerts(
  db: PrismaClient,
  batchSize = ORDER_OPERATIONAL_SLA_ALERT_BATCH_SIZE,
) {
  const startedAt = Date.now();
  const candidates = await findDueCandidates(db, Math.max(1, Math.min(batchSize, 100)));
  let created = 0;
  let deliveries = 0;
  for (const candidate of candidates) {
    const result = await createAlertAndFanOut(db, candidate);
    if (!result.created) continue;
    created += 1;
    deliveries += result.deliveries;
    console.info(
      candidate.stage === 'WARNING'
        ? '[OPERATIONAL_SLA_WARNING_CREATED]'
        : '[OPERATIONAL_SLA_CRITICAL_CREATED]',
      {
        alertId: result.alertId,
        tenantId: candidate.tenantId,
        storeId: candidate.storeId,
        orderId: candidate.orderId,
        stage: candidate.stage,
      },
    );
  }
  return { candidates: candidates.length, created, deliveries, durationMs: Date.now() - startedAt };
}

interface ResolvedAlert {
  id: string;
  tenantId: string;
  storeId: string;
  orderId: string;
}

export async function resolveInactiveOrderOperationalSlaAlerts(
  db: PrismaClient,
  batchSize = ORDER_OPERATIONAL_SLA_ALERT_BATCH_SIZE,
) {
  const now = new Date();
  const resolved = await db.$transaction(async (tx) => {
    const alerts = await tx.$queryRaw<ResolvedAlert[]>(Prisma.sql`
      WITH stale AS (
        SELECT alerts."id"
        FROM "order_operational_sla_alerts" alerts
        INNER JOIN "orders" ON "orders"."id" = alerts."orderId"
        LEFT JOIN "store_entitlements" entitlements
          ON entitlements."storeId" = alerts."storeId"
          AND entitlements."tenantId" = alerts."tenantId"
        WHERE alerts."resolvedAt" IS NULL
          AND (
            orders."status" <> 'PENDING'
            OR orders."statusChangedAt" <> alerts."actionableAt"
            OR entitlements."operationalSlaEnabled" IS DISTINCT FROM true
            OR entitlements."operationalSlaEnabledAt" IS NULL
            OR alerts."actionableAt" < entitlements."operationalSlaEnabledAt"
          )
        ORDER BY alerts."triggeredAt" ASC, alerts."id" ASC
        LIMIT ${Math.max(1, Math.min(batchSize, 100))}
        FOR UPDATE OF alerts SKIP LOCKED
      )
      UPDATE "order_operational_sla_alerts" alerts
      SET "resolvedAt" = ${now}, "updatedAt" = ${now}
      FROM stale
      WHERE alerts."id" = stale."id"
      RETURNING alerts."id", alerts."tenantId", alerts."storeId", alerts."orderId"
    `);
    if (alerts.length) {
      await tx.orderOperationalSlaDelivery.updateMany({
        where: {
          slaAlertId: { in: alerts.map((alert) => alert.id) },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'SKIPPED',
          failedAt: now,
          lockedAt: null,
          lockToken: null,
          lastError: 'operational_sla_resolved',
        },
      });
    }
    return alerts;
  });
  for (const alert of resolved) console.info('[OPERATIONAL_SLA_RESOLVED]', alert);
  return { resolved: resolved.length };
}

export async function purgeResolvedOrderOperationalSlaAlerts(
  db: PrismaClient,
  retentionDays: number,
  batchSize = ORDER_OPERATIONAL_SLA_ALERT_BATCH_SIZE,
) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
  const alerts = await db.orderOperationalSlaAlert.findMany({
    where: { resolvedAt: { lt: cutoff } },
    orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
    take: Math.max(1, Math.min(batchSize, 100)),
    select: { id: true },
  });
  if (!alerts.length) return { deleted: 0, retentionDays };
  const result = await db.orderOperationalSlaAlert.deleteMany({
    where: { id: { in: alerts.map((alert) => alert.id) } },
  });
  return { deleted: result.count, retentionDays };
}
