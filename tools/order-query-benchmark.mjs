import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });
const HELP = `
Uso: pnpm perf:orders:queries

Executa EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) somente para consultas de leitura.

Variáveis:
  DIRECT_URL ou DATABASE_URL             Conexão PostgreSQL
  ORDER_PERF_PROJECT_REF                 Project Ref esperado na conexão
  ORDER_PERF_STORE_ID                    ID da loja de staging
  ORDER_PERF_STORE_SLUG                  Alternativa segura ao ID da loja
  ORDER_PERF_ACKNOWLEDGE_STAGING=true    Confirma que o banco não é produção
  ORDER_PERF_SAMPLES                     Amostras por consulta, padrão 5
  ORDER_PERF_BUDGET_MS                   Orçamento por consulta, padrão 750
  ORDER_PERF_SEARCH_TERM                 Termo sintético opcional para busca
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

function timingSummary(values) {
  return {
    min: Number(Math.min(...values).toFixed(3)),
    p50: Number(percentile(values, 0.5).toFixed(3)),
    p95: Number(percentile(values, 0.95).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
  };
}

function assertStagingConnection(connectionString, projectRef) {
  if (!projectRef) throw new Error('ORDER_PERF_PROJECT_REF é obrigatória.');
  const url = new URL(connectionString);
  const identity = `${decodeURIComponent(url.username)} ${url.hostname}`.toLowerCase();
  if (!identity.includes(projectRef.toLowerCase())) {
    throw new Error('A conexão não corresponde ao Project Ref de staging informado.');
  }
}

const QUERIES = [
  {
    name: 'board-summary',
    text: `
      SELECT "status", COUNT(*)::integer AS "count"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
      GROUP BY "status"
    `,
  },
  {
    name: 'board-lane-new',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "createdAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2 AND "status" = 'PENDING'
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 11
    `,
  },
  {
    name: 'board-lane-preparation',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "createdAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "status" IN ('CONFIRMED', 'PREPARING')
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 11
    `,
  },
  {
    name: 'board-lane-ready-delivery',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "createdAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "status" IN ('READY', 'OUT_FOR_DELIVERY')
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 11
    `,
  },
  {
    name: 'board-lane-finished',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "statusChangedAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "status" IN ('DELIVERED', 'CANCELLED')
        AND "statusChangedAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $3) AT TIME ZONE $3
        AND "statusChangedAt" < (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $3) + interval '1 day') AT TIME ZONE $3
      ORDER BY "statusChangedAt" DESC, "id" DESC
      LIMIT 11
    `,
    timeZone: true,
  },
  {
    name: 'board-delayed',
    text: `
      SELECT COUNT(*)::integer AS "count"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND (
          ("status" = 'PENDING' AND "createdAt" <= CURRENT_TIMESTAMP - interval '3 minutes')
          OR ("status" = 'CONFIRMED' AND COALESCE("acceptedAt", "statusChangedAt") <= CURRENT_TIMESTAMP - interval '5 minutes')
          OR ("status" = 'PREPARING' AND COALESCE("preparingAt", "statusChangedAt") <= CURRENT_TIMESTAMP - interval '50 minutes')
          OR ("status" = 'READY' AND "modality" = 'PICKUP' AND COALESCE("readyAt", "statusChangedAt") <= CURRENT_TIMESTAMP - interval '15 minutes')
          OR ("status" = 'READY' AND "modality" = 'DELIVERY' AND COALESCE("readyAt", "statusChangedAt") <= CURRENT_TIMESTAMP - interval '5 minutes')
          OR ("status" = 'OUT_FOR_DELIVERY' AND COALESCE("dispatchedAt", "statusChangedAt") <= CURRENT_TIMESTAMP - interval '50 minutes')
        )
    `,
  },
  {
    name: 'board-search',
    text: `
      SELECT "id", "orderNumber", "customerName", "status", "createdAt"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "customerName" ILIKE '%' || $3 || '%'
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 11
    `,
    search: true,
  },
  {
    name: 'board-keyset-pagination',
    text: `
      WITH cursor AS (
        SELECT "createdAt", "id"
        FROM "orders"
        WHERE "tenantId" = $1
          AND "storeId" = $2
          AND "status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
        ORDER BY "createdAt" ASC, "id" ASC
        OFFSET 9
        LIMIT 1
      )
      SELECT orders."id", orders."orderNumber", orders."status", orders."createdAt"
      FROM "orders" AS orders
      CROSS JOIN cursor
      WHERE orders."tenantId" = $1
        AND orders."storeId" = $2
        AND orders."status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
        AND (
          orders."createdAt" > cursor."createdAt"
          OR (orders."createdAt" = cursor."createdAt" AND orders."id" > cursor."id")
        )
      ORDER BY orders."createdAt" ASC, orders."id" ASC
      LIMIT 11
    `,
  },
  {
    name: 'board-item-preview',
    text: `
      WITH selected_orders AS (
        SELECT "id"
        FROM "orders"
        WHERE "tenantId" = $1
          AND "storeId" = $2
          AND "status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT 10
      )
      SELECT items."id", items."orderId", items."productName", items."quantity", items."notes"
      FROM "order_items" AS items
      JOIN selected_orders ON selected_orders."id" = items."orderId"
      ORDER BY items."orderId", items."position", items."id"
    `,
  },
];

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (process.env.ORDER_PERF_ACKNOWLEDGE_STAGING !== 'true') {
    throw new Error('Confirme o banco de staging com ORDER_PERF_ACKNOWLEDGE_STAGING=true.');
  }
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const storeId = process.env.ORDER_PERF_STORE_ID;
  const storeSlug = process.env.ORDER_PERF_STORE_SLUG;
  if (!connectionString) throw new Error('DIRECT_URL ou DATABASE_URL é obrigatória.');
  assertStagingConnection(connectionString, process.env.ORDER_PERF_PROJECT_REF);
  if (!storeId && !storeSlug) {
    throw new Error('ORDER_PERF_STORE_ID ou ORDER_PERF_STORE_SLUG é obrigatória.');
  }
  const samples = integer('ORDER_PERF_SAMPLES', 5, 25);
  const budgetMs = integer('ORDER_PERF_BUDGET_MS', 750, 60_000);
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

    const volumeResult = await client.query(
      `SELECT
         COUNT(*)::integer AS total,
         COUNT(*) FILTER (
           WHERE "status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
         )::integer AS active
       FROM "orders"
       WHERE "tenantId" = $1 AND "storeId" = $2`,
      [store.tenantId, store.id],
    );

    const reports = [];
    for (const query of QUERIES) {
      const executions = [];
      const roundTrips = [];
      let planDetails;
      let planningTime = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const parameters = query.timeZone
          ? [store.tenantId, store.id, store.timeZone]
          : query.search
            ? [
                store.tenantId,
                store.id,
                process.env.ORDER_PERF_SEARCH_TERM ?? '__pedidolocal_benchmark_no_match__',
              ]
            : [store.tenantId, store.id];
        const startedAt = performance.now();
        const result = await client.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
          parameters,
        );
        roundTrips.push(performance.now() - startedAt);
        const explain = result.rows[0]['QUERY PLAN'][0];
        executions.push(Number(explain['Execution Time']));
        planningTime = Number(explain['Planning Time']);
        planDetails = collectPlanDetails(explain.Plan);
      }
      reports.push({
        query: query.name,
        samples,
        databaseExecutionMs: timingSummary(executions),
        clientRoundTripMs: timingSummary(roundTrips),
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
    process.stdout.write(`${JSON.stringify({ volume: volumeResult.rows[0], reports }, null, 2)}\n`);
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
