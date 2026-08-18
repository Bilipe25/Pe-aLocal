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
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

export interface ProductTrendRow {
  productId: string;
  name: string;
  currentQuantity: number;
  previousQuantity: number;
}

export async function getReportsProductTrends(
  current: ReportsQueryScope,
  previous: ReportsQueryScope,
  limit = 25,
) {
  return getDb().$queryRaw<ProductTrendRow[]>(Prisma.sql`
    WITH scoped_items AS (
      SELECT
        items."productId" AS "productId",
        items."productName" AS "productName",
        items."quantity" AS "quantity",
        orders."operationalStartedAt" AS "operationalStartedAt",
        CASE
          WHEN orders."operationalStartedAt" >= ${current.start}
            AND orders."operationalStartedAt" < ${current.end}
          THEN 'current'
          ELSE 'previous'
        END AS "period"
      FROM "order_items" AS items
      INNER JOIN "orders" AS orders ON orders."id" = items."orderId"
      WHERE orders."tenantId" = ${current.tenantId}
        AND orders."storeId" = ${current.storeId}
        AND (
          (orders."operationalStartedAt" >= ${current.start}
            AND orders."operationalStartedAt" < ${current.end})
          OR
          (orders."operationalStartedAt" >= ${previous.start}
            AND orders."operationalStartedAt" < ${previous.end})
        )
        AND orders."status" = 'DELIVERED'
        AND orders."paymentStatus" = 'PAID'
    ), aggregated AS (
      SELECT
        "productId",
        (ARRAY_AGG(
          "productName"
          ORDER BY ("period" = 'current') DESC, "operationalStartedAt" DESC
        ))[1] AS "name",
        COALESCE(SUM("quantity") FILTER (WHERE "period" = 'current'), 0)::integer AS "currentQuantity",
        COALESCE(SUM("quantity") FILTER (WHERE "period" = 'previous'), 0)::integer AS "previousQuantity"
      FROM scoped_items
      GROUP BY "productId"
    )
    SELECT "productId", "name", "currentQuantity", "previousQuantity"
    FROM aggregated
    ORDER BY GREATEST("currentQuantity", "previousQuantity") DESC, "productId" ASC
    LIMIT ${limit}
  `);
}

export interface HourDistributionRow {
  hour: number;
  orderCount: number;
}

export async function getReportsHourDistribution(scope: ReportsQueryScope) {
  return getDb().$queryRaw<HourDistributionRow[]>(Prisma.sql`
    SELECT
      EXTRACT(HOUR FROM "operationalStartedAt" AT TIME ZONE ${scope.timeZone})::integer AS "hour",
      COUNT(*)::integer AS "orderCount"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
    GROUP BY 1
    ORDER BY "hour" ASC
  `);
}

export interface WeekdayDistributionRow {
  weekday: number;
  orderCount: number;
}

export async function getReportsWeekdayDistribution(scope: ReportsQueryScope) {
  return getDb().$queryRaw<WeekdayDistributionRow[]>(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM "operationalStartedAt" AT TIME ZONE ${scope.timeZone})::integer AS "weekday",
      COUNT(*)::integer AS "orderCount"
    FROM "orders"
    WHERE "tenantId" = ${scope.tenantId}
      AND "storeId" = ${scope.storeId}
      AND "operationalStartedAt" >= ${scope.start}
      AND "operationalStartedAt" < ${scope.end}
    GROUP BY 1
    ORDER BY "orderCount" DESC, "weekday" ASC
  `);
}

export interface DurationRow {
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

export interface HourDurationRow extends DurationRow {
  hour: number;
}

export async function getReportsDurationsByHour(scope: ReportsQueryScope) {
  return getDb().$queryRaw<HourDurationRow[]>(Prisma.sql`
    SELECT
      EXTRACT(HOUR FROM "operationalStartedAt" AT TIME ZONE ${scope.timeZone})::integer AS "hour",
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
    GROUP BY 1
    ORDER BY "hour" ASC
  `);
}

export interface ModalityRow {
  modality: 'DELIVERY' | 'PICKUP';
  orderCount: number;
  cancelledOrders: number;
  completedPaidOrders: number;
  completedValueCents: bigint | number;
}

export async function getReportsModalities(scope: ReportsQueryScope) {
  return getDb().$queryRaw<ModalityRow[]>(Prisma.sql`
    SELECT
      "modality",
      COUNT(*)::integer AS "orderCount",
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
    GROUP BY "modality"
    ORDER BY "modality" ASC
  `);
}

export interface SlaCountsRow {
  attentionOrders: number;
  criticalOrders: number;
}

export async function getReportsSlaCounts(scope: ReportsQueryScope) {
  const rows = await getDb().$queryRaw<SlaCountsRow[]>(Prisma.sql`
    SELECT
      COUNT(DISTINCT alerts."orderId")::integer AS "attentionOrders",
      COUNT(DISTINCT alerts."orderId") FILTER (
        WHERE alerts."stage" = 'CRITICAL'
      )::integer AS "criticalOrders"
    FROM "order_operational_sla_alerts" AS alerts
    INNER JOIN "orders" AS orders
      ON orders."id" = alerts."orderId"
      AND orders."tenantId" = alerts."tenantId"
      AND orders."storeId" = alerts."storeId"
    WHERE alerts."tenantId" = ${scope.tenantId}
      AND alerts."storeId" = ${scope.storeId}
      AND orders."operationalStartedAt" >= ${scope.start}
      AND orders."operationalStartedAt" < ${scope.end}
  `);
  return rows[0] ?? { attentionOrders: 0, criticalOrders: 0 };
}
