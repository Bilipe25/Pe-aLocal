import pg from 'pg';

const { Client } = pg;
const HELP = `
Uso: pnpm perf:orders:queries

Executa EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) somente para consultas de leitura.

Variáveis:
  DIRECT_URL ou DATABASE_URL             Conexão PostgreSQL
  ORDER_PERF_STORE_ID                    Loja descartável de staging
  ORDER_PERF_ACKNOWLEDGE_STAGING=true    Confirma que o banco não é produção
  ORDER_PERF_SAMPLES                     Amostras por consulta, padrão 5
  ORDER_PERF_BUDGET_MS                   Orçamento por consulta, padrão 750
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

function collectPlanDetails(node, details = { indexes: new Set(), sharedHit: 0, sharedRead: 0 }) {
  if (typeof node['Index Name'] === 'string') details.indexes.add(node['Index Name']);
  details.sharedHit += Number(node['Shared Hit Blocks'] ?? 0);
  details.sharedRead += Number(node['Shared Read Blocks'] ?? 0);
  for (const child of node.Plans ?? []) collectPlanDetails(child, details);
  return details;
}

const QUERIES = [
  {
    name: 'active-queue',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "createdAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "status" IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT 31
    `,
  },
  {
    name: 'recent-history',
    text: `
      SELECT "id", "orderNumber", "status", "paymentStatus", "total", "createdAt", "version"
      FROM "orders"
      WHERE "tenantId" = $1 AND "storeId" = $2
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 31
    `,
  },
  {
    name: 'daily-metrics',
    text: `
      SELECT "status", "paymentStatus", COUNT(*)::integer AS "count", COALESCE(SUM("total"), 0)::bigint AS "total"
      FROM "orders"
      WHERE "tenantId" = $1
        AND "storeId" = $2
        AND "createdAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $3) AT TIME ZONE $3
        AND "createdAt" < (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE $3) + interval '1 day') AT TIME ZONE $3
      GROUP BY "status", "paymentStatus"
    `,
    timeZone: true,
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
  if (!connectionString) throw new Error('DIRECT_URL ou DATABASE_URL é obrigatória.');
  if (!storeId) throw new Error('ORDER_PERF_STORE_ID é obrigatória.');
  const samples = integer('ORDER_PERF_SAMPLES', 5, 25);
  const budgetMs = integer('ORDER_PERF_BUDGET_MS', 750, 60_000);
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '10s'`);
    const storeResult = await client.query(
      'SELECT "tenantId", "timeZone" FROM "stores" WHERE "id" = $1 LIMIT 1',
      [storeId],
    );
    const store = storeResult.rows[0];
    if (!store) throw new Error('A loja de benchmark não foi encontrada.');

    const reports = [];
    for (const query of QUERIES) {
      const executions = [];
      let planDetails;
      for (let sample = 0; sample < samples; sample += 1) {
        const parameters = query.timeZone
          ? [store.tenantId, storeId, store.timeZone]
          : [store.tenantId, storeId];
        const result = await client.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
          parameters,
        );
        const explain = result.rows[0]['QUERY PLAN'][0];
        executions.push(Number(explain['Execution Time']));
        planDetails = collectPlanDetails(explain.Plan);
      }
      reports.push({
        query: query.name,
        samples,
        executionMs: {
          min: Number(Math.min(...executions).toFixed(3)),
          p50: Number(percentile(executions, 0.5).toFixed(3)),
          p95: Number(percentile(executions, 0.95).toFixed(3)),
          max: Number(Math.max(...executions).toFixed(3)),
        },
        indexes: [...(planDetails?.indexes ?? [])].sort(),
        sharedHitBlocks: planDetails?.sharedHit ?? 0,
        sharedReadBlocks: planDetails?.sharedRead ?? 0,
        budgetMs,
      });
    }
    await client.query('ROLLBACK');
    process.stdout.write(`${JSON.stringify({ reports }, null, 2)}\n`);
    if (reports.some((report) => report.executionMs.p95 > budgetMs)) process.exitCode = 1;
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
