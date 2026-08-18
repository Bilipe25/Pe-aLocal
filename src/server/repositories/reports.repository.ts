import { Prisma } from '@prisma/client';

import { getDb } from '@/server/database/client';
import type { ReportSeriesGranularity } from '@/types/reports';

export interface ReportsQueryScope {
  tenantId: string;
  storeId: string;
  timeZone: string;
  start: Date;
  end: Date;
}

interface SummaryRow {
  operationalOrders: number;
  cancelledOrders: number;
  completedPaidOrders: number;
  completedValueCents: bigint | number;
}

export async function getReportsSummary(scope: ReportsQueryScope) {
  const rows = await getDb().$queryRaw<SummaryRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::integer AS "operationalOrders",
      COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::integer AS "cancelledOrders",
      COUNT(*) FILTER (
        WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
      )::integer AS "completedPaidOrders",
      COALESCE(SUM("total") FILTER (
        WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
      ), 0)::bigint AS "completedValueCents"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
  `);
  return (
    rows[0] ?? {
      operationalOrders: 0,
      cancelledOrders: 0,
      completedPaidOrders: 0,
      completedValueCents: 0,
    }
  );
}

interface SeriesRow {
  key: string;
  orderCount: number;
  completedValueCents: bigint | number;
}

function seriesBucket(granularity: ReportSeriesGranularity, timeZone: string) {
  if (granularity === 'HOUR') {
    return Prisma.sql`to_char("operationalStartedAt" AT TIME ZONE ${timeZone}, 'YYYY-MM-DD"T"HH24:00')`;
  }
  if (granularity === 'WEEK') {
    return Prisma.sql`to_char(date_trunc('week', "operationalStartedAt" AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD')`;
  }
  return Prisma.sql`to_char(("operationalStartedAt" AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD')`;
}

export async function getReportsSeries(
  scope: ReportsQueryScope,
  granularity: ReportSeriesGranularity,
) {
  const bucket = seriesBucket(granularity, scope.timeZone);
  return getDb().$queryRaw<SeriesRow[]>(Prisma.sql`
    SELECT
      ${bucket} AS "key",
      COUNT(*)::integer AS "orderCount",
      COALESCE(SUM("total") FILTER (
        WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
      ), 0)::bigint AS "completedValueCents"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
    GROUP BY ${bucket}
    ORDER BY ${bucket} ASC
  `);
}

interface ProductRow {
  productId: string;
  name: string;
  quantity: number;
}

export async function getReportsTopProducts(scope: ReportsQueryScope, limit = 5) {
  return getDb().$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT
      items."productId" AS "productId",
      (ARRAY_AGG(
        items."productName"
        ORDER BY orders."operationalStartedAt" DESC, items."id" DESC
      ))[1] AS "name",
      SUM(items."quantity")::integer AS "quantity"
    FROM "order_items" AS items
    INNER JOIN "orders" AS orders ON orders."id" = items."orderId"
    WHERE orders."tenantId" = ${scope.tenantId}
      AND orders."storeId" = ${scope.storeId}
      AND orders."operationalStartedAt" >= ${scope.start}
      AND orders."operationalStartedAt" < ${scope.end}
      AND orders."status" = 'DELIVERED'
      AND orders."paymentStatus" = 'PAID'
    GROUP BY items."productId"
    ORDER BY SUM(items."quantity") DESC, items."productId" ASC
    LIMIT ${limit}
  `);
}

interface PeakHourRow {
  hour: number;
  orderCount: number;
}

export async function getReportsPeakHour(scope: ReportsQueryScope) {
  const rows = await getDb().$queryRaw<PeakHourRow[]>(Prisma.sql`
    SELECT
      EXTRACT(HOUR FROM "operationalStartedAt" AT TIME ZONE ${scope.timeZone})::integer AS "hour",
      COUNT(*)::integer AS "orderCount"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
    GROUP BY 1
    ORDER BY "orderCount" DESC, "hour" ASC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

interface DurationRow {
  averageAcceptanceSeconds: number | null;
  acceptanceSampleSize: number;
  averagePreparationSeconds: number | null;
  preparationSampleSize: number;
}

export async function getReportsDurations(scope: ReportsQueryScope) {
  const rows = await getDb().$queryRaw<DurationRow[]>(Prisma.sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "operationalStartedAt"))) FILTER (
        WHERE "acceptedAt" IS NOT NULL
          AND "acceptedAt" >= "operationalStartedAt"
      )::double precision AS "averageAcceptanceSeconds",
      COUNT(*) FILTER (
        WHERE "acceptedAt" IS NOT NULL
          AND "acceptedAt" >= "operationalStartedAt"
      )::integer AS "acceptanceSampleSize",
      AVG(EXTRACT(EPOCH FROM ("readyAt" - "preparingAt"))) FILTER (
        WHERE "readyAt" IS NOT NULL
          AND "preparingAt" IS NOT NULL
          AND "readyAt" >= "preparingAt"
      )::double precision AS "averagePreparationSeconds",
      COUNT(*) FILTER (
        WHERE "readyAt" IS NOT NULL
          AND "preparingAt" IS NOT NULL
          AND "readyAt" >= "preparingAt"
      )::integer AS "preparationSampleSize"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
  `);
  return (
    rows[0] ?? {
      averageAcceptanceSeconds: null,
      acceptanceSampleSize: 0,
      averagePreparationSeconds: null,
      preparationSampleSize: 0,
    }
  );
}

export async function getReportsModalities(scope: ReportsQueryScope) {
  return getDb().order.groupBy({
    by: ['modality'],
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      operationalStartedAt: { gte: scope.start, lt: scope.end },
    },
    _count: { _all: true },
  });
}

export async function countReportsAttentionAlerts(scope: ReportsQueryScope) {
  return getDb().orderOperationalSlaAlert.count({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      order: {
        operationalStartedAt: { gte: scope.start, lt: scope.end },
      },
    },
  });
}
