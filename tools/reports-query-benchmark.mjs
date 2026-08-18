import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

const HELP = `
Uso: pnpm perf:reports:queries

Executa EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) somente para agregações de leitura.

Variáveis:
  DIRECT_URL ou DATABASE_URL               Conexão PostgreSQL
  REPORTS_PERF_PROJECT_REF                 Project Ref esperado na conexão
  REPORTS_PERF_STORE_ID                    ID da loja de staging
  REPORTS_PERF_STORE_SLUG                  Alternativa segura ao ID
  REPORTS_PERF_ACKNOWLEDGE_STAGING=true    Confirma que o banco não é produção
  REPORTS_PERF_SAMPLES                     Amostras por consulta, padrão 5
  REPORTS_PERF_BUDGET_MS                   Orçamento p95, padrão 750 ms
  REPORTS_PERF_DAYS                        Janela simulada, padrão 365 dias
`;

function integer(name, fallback, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} deve ser um inteiro entre 1 e ${max}.`);
  }
  return value;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function timingSummary(values) {
  return {
    min: Number(Math.min(...values).toFixed(3)),
    p50: Number(percentile(values, 0.5).toFixed(3)),
    p95: Number(percentile(values, 0.95).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
  };
}

function collectPlanDetails(
  node,
  details = {
    indexes: new Set(),
    nodeTypes: new Set(),
    sequentialScans: new Set(),
    sharedHit: 0,
    sharedRead: 0,
  },
) {
  if (typeof node['Index Name'] === 'string') details.indexes.add(node['Index Name']);
  if (typeof node['Node Type'] === 'string') details.nodeTypes.add(node['Node Type']);
  if (node['Node Type'] === 'Seq Scan' && typeof node['Relation Name'] === 'string') {
    details.sequentialScans.add(node['Relation Name']);
  }
  details.sharedHit += Number(node['Shared Hit Blocks'] ?? 0);
  details.sharedRead += Number(node['Shared Read Blocks'] ?? 0);
  for (const child of node.Plans ?? []) collectPlanDetails(child, details);
  return details;
}

function assertStagingConnection(connectionString, projectRef) {
  if (!projectRef) throw new Error('REPORTS_PERF_PROJECT_REF é obrigatória.');
  const url = new URL(connectionString);
  const identity = `${decodeURIComponent(url.username)} ${url.hostname}`.toLowerCase();
  if (!identity.includes(projectRef.toLowerCase())) {
    throw new Error('A conexão não corresponde ao Project Ref de staging informado.');
  }
}

const QUERIES = [
  {
    name: 'reports-summary',
    text: `
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
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
    `,
  },
  {
    name: 'reports-weekly-series',
    text: `
      SELECT
        date_trunc('week', "operationalStartedAt" AT TIME ZONE $5)::date AS "bucket",
        COUNT(*)::integer AS "orderCount",
        COALESCE(SUM("total") FILTER (
          WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
        ), 0)::bigint AS "completedValueCents"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
      GROUP BY 1 ORDER BY 1
    `,
    timeZone: true,
  },
  {
    name: 'reports-product-trends',
    text: `
      WITH scoped_items AS (
        SELECT items."productId", items."quantity"
        FROM "order_items" AS items
        INNER JOIN "orders" AS orders ON orders."id" = items."orderId"
        WHERE orders."tenantId" = $1 AND orders."storeId" = $2
          AND (
            (orders."operationalStartedAt" >= $3 AND orders."operationalStartedAt" < $4)
            OR (orders."operationalStartedAt" >= $5 AND orders."operationalStartedAt" < $6)
          )
          AND orders."status" = 'DELIVERED' AND orders."paymentStatus" = 'PAID'
      )
      SELECT "productId", SUM("quantity")::integer AS "quantity"
      FROM scoped_items
      GROUP BY "productId"
      ORDER BY SUM("quantity") DESC, "productId" ASC
      LIMIT 25
    `,
    previous: true,
  },
  {
    name: 'reports-durations',
    text: `
      SELECT
        AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "operationalStartedAt"))) FILTER (
          WHERE "acceptedAt" IS NOT NULL AND "acceptedAt" >= "operationalStartedAt"
        ) AS "averageAcceptanceSeconds",
        AVG(EXTRACT(EPOCH FROM ("readyAt" - "preparingAt"))) FILTER (
          WHERE "readyAt" IS NOT NULL AND "preparingAt" IS NOT NULL
            AND "readyAt" >= "preparingAt"
        ) AS "averagePreparationSeconds"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
    `,
  },
  {
    name: 'reports-hour-distribution',
    text: `
      SELECT EXTRACT(HOUR FROM "operationalStartedAt" AT TIME ZONE $5)::integer AS "hour",
        COUNT(*)::integer AS "orderCount"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
      GROUP BY 1 ORDER BY "hour" ASC
    `,
    timeZone: true,
  },
  {
    name: 'reports-durations-by-hour',
    text: `
      SELECT
        EXTRACT(HOUR FROM "operationalStartedAt" AT TIME ZONE $5)::integer AS "hour",
        AVG(EXTRACT(EPOCH FROM ("acceptedAt" - "operationalStartedAt"))) FILTER (
          WHERE "acceptedAt" IS NOT NULL AND "acceptedAt" >= "operationalStartedAt"
        ) AS "averageAcceptanceSeconds",
        AVG(EXTRACT(EPOCH FROM ("readyAt" - "preparingAt"))) FILTER (
          WHERE "readyAt" IS NOT NULL AND "preparingAt" IS NOT NULL
            AND "readyAt" >= "preparingAt"
        ) AS "averagePreparationSeconds"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
      GROUP BY 1 ORDER BY "hour" ASC
    `,
    timeZone: true,
  },
  {
    name: 'reports-modalities',
    text: `
      SELECT "modality", COUNT(*)::integer AS "orderCount",
        COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::integer AS "cancelledOrders",
        COUNT(*) FILTER (
          WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
        )::integer AS "completedPaidOrders",
        COALESCE(SUM("total") FILTER (
          WHERE "status" = 'DELIVERED' AND "paymentStatus" = 'PAID'
        ), 0)::bigint AS "completedValueCents"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
        AND "operationalStartedAt" >= $3 AND "operationalStartedAt" < $4
      GROUP BY "modality" ORDER BY "modality" ASC
    `,
  },
  {
    name: 'reports-sla-orders',
    text: `
      SELECT COUNT(DISTINCT alerts."orderId")::integer AS "attentionOrders",
        COUNT(DISTINCT alerts."orderId") FILTER (
          WHERE alerts."stage" = 'CRITICAL'
        )::integer AS "criticalOrders"
      FROM "order_operational_sla_alerts" AS alerts
      INNER JOIN "orders" AS orders
        ON orders."id" = alerts."orderId"
        AND orders."tenantId" = alerts."tenantId"
        AND orders."storeId" = alerts."storeId"
      WHERE alerts."tenantId" = $1 AND alerts."storeId" = $2
        AND orders."operationalStartedAt" >= $3 AND orders."operationalStartedAt" < $4
    `,
  },
];

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (process.env.REPORTS_PERF_ACKNOWLEDGE_STAGING !== 'true') {
    throw new Error('Confirme o banco de staging com REPORTS_PERF_ACKNOWLEDGE_STAGING=true.');
  }
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const storeId = process.env.REPORTS_PERF_STORE_ID;
  const storeSlug = process.env.REPORTS_PERF_STORE_SLUG;
  if (!connectionString) throw new Error('DIRECT_URL ou DATABASE_URL é obrigatória.');
  assertStagingConnection(connectionString, process.env.REPORTS_PERF_PROJECT_REF);
  if (!storeId && !storeSlug) {
    throw new Error('REPORTS_PERF_STORE_ID ou REPORTS_PERF_STORE_SLUG é obrigatória.');
  }

  const samples = integer('REPORTS_PERF_SAMPLES', 5, 25);
  const budgetMs = integer('REPORTS_PERF_BUDGET_MS', 750, 60_000);
  const days = integer('REPORTS_PERF_DAYS', 365, 365);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '10s'`);
    const storeResult = storeId
      ? await client.query(
          'SELECT "id", "tenantId", "timeZone" FROM "stores" WHERE "id" = $1 LIMIT 1',
          [storeId],
        )
      : await client.query(
          'SELECT "id", "tenantId", "timeZone" FROM "stores" WHERE "slug" = $1 LIMIT 1',
          [storeSlug],
        );
    const store = storeResult.rows[0];
    if (!store) throw new Error('A loja de benchmark não foi encontrada.');

    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const previousEnd = start;
    const previousStart = new Date(previousEnd.getTime() - (end.getTime() - start.getTime()));
    const reports = [];
    for (const query of QUERIES) {
      const databaseExecutions = [];
      const clientRoundTrips = [];
      let planDetails;
      let planningTime = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const parameters = query.timeZone
          ? [store.tenantId, store.id, start, end, store.timeZone]
          : query.previous
            ? [store.tenantId, store.id, start, end, previousStart, previousEnd]
            : [store.tenantId, store.id, start, end];
        const startedAt = performance.now();
        const result = await client.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
          parameters,
        );
        clientRoundTrips.push(performance.now() - startedAt);
        const explain = result.rows[0]['QUERY PLAN'][0];
        databaseExecutions.push(Number(explain['Execution Time']));
        planningTime = Number(explain['Planning Time']);
        planDetails = collectPlanDetails(explain.Plan);
      }
      reports.push({
        query: query.name,
        samples,
        databaseExecutionMs: timingSummary(databaseExecutions),
        clientRoundTripMs: timingSummary(clientRoundTrips),
        planningMs: Number(planningTime.toFixed(3)),
        indexes: [...(planDetails?.indexes ?? [])].sort(),
        nodeTypes: [...(planDetails?.nodeTypes ?? [])].sort(),
        sequentialScans: [...(planDetails?.sequentialScans ?? [])].sort(),
        sharedHitBlocks: planDetails?.sharedHit ?? 0,
        sharedReadBlocks: planDetails?.sharedRead ?? 0,
        budgetMs,
      });
    }
    await client.query('ROLLBACK');
    process.stdout.write(`${JSON.stringify({ windowDays: days, reports }, null, 2)}\n`);
    if (reports.some((report) => report.databaseExecutionMs.p95 > budgetMs)) {
      process.exitCode = 1;
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
