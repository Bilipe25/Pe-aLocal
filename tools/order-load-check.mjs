import { performance } from 'node:perf_hooks';

const HELP = `
Uso: pnpm perf:orders:load

Executa somente GETs contra a Central de Pedidos e mede latência/erros.

Variáveis:
  ORDER_LOAD_BASE_URL                 URL local ou de staging (obrigatória)
  ORDER_LOAD_COOKIE                   Cookie de uma sessão de teste (opcional em rotas públicas)
  ORDER_LOAD_PATH                     Caminho, padrão /dashboard/orders
  ORDER_LOAD_REQUESTS                 Total de requisições, padrão 200
  ORDER_LOAD_CONCURRENCY              Concorrência, padrão 50, máximo 100
  ORDER_LOAD_P95_BUDGET_MS            Orçamento de p95, padrão 1000
  ORDER_LOAD_ACKNOWLEDGE_STAGING      Deve ser true fora de localhost

Produção é recusada intencionalmente.
`;

function integer(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function assertSafeTarget(url) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('ORDER_LOAD_BASE_URL deve usar http ou https.');
  }
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const productionHosts = new Set(['pedidolocal.com.br', 'www.pedidolocal.com.br']);
  if (productionHosts.has(host) || host.includes('production')) {
    throw new Error('O teste de carga não pode ser executado contra produção.');
  }
  if (!local && !host.includes('staging')) {
    throw new Error('Fora de localhost, o hostname deve identificar staging explicitamente.');
  }
  if (!local && process.env.ORDER_LOAD_ACKNOWLEDGE_STAGING !== 'true') {
    throw new Error('Confirme staging com ORDER_LOAD_ACKNOWLEDGE_STAGING=true.');
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const baseUrl = process.env.ORDER_LOAD_BASE_URL;
  if (!baseUrl) throw new Error('ORDER_LOAD_BASE_URL é obrigatória.');
  const target = new URL(process.env.ORDER_LOAD_PATH ?? '/dashboard/orders', baseUrl);
  assertSafeTarget(target);

  const requestCount = integer('ORDER_LOAD_REQUESTS', 200, { max: 10_000 });
  const concurrency = integer('ORDER_LOAD_CONCURRENCY', 50, { max: 100 });
  const p95BudgetMs = integer('ORDER_LOAD_P95_BUDGET_MS', 1_000, { max: 60_000 });
  const headers = { Accept: 'text/html' };
  if (process.env.ORDER_LOAD_COOKIE) headers.Cookie = process.env.ORDER_LOAD_COOKIE;

  let nextRequest = 0;
  const results = [];
  async function worker() {
    while (nextRequest < requestCount) {
      const requestNumber = nextRequest;
      nextRequest += 1;
      const startedAt = performance.now();
      try {
        const response = await fetch(target, {
          method: 'GET',
          headers,
          redirect: 'manual',
          cache: 'no-store',
        });
        const body = await response.arrayBuffer();
        results[requestNumber] = {
          durationMs: performance.now() - startedAt,
          status: response.status,
          bytes: body.byteLength,
          ok: response.status >= 200 && response.status < 300,
        };
      } catch (error) {
        results[requestNumber] = {
          durationMs: performance.now() - startedAt,
          status: 0,
          bytes: 0,
          ok: false,
          error: error instanceof Error ? error.name : 'UnknownError',
        };
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, () => worker()));
  const elapsedMs = performance.now() - startedAt;
  const durations = results.map((result) => result.durationMs);
  const successful = results.filter((result) => result.ok);
  const statuses = results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
    return summary;
  }, {});
  const report = {
    target: `${target.origin}${target.pathname}`,
    requests: requestCount,
    concurrency,
    successful: successful.length,
    failed: requestCount - successful.length,
    statusCounts: statuses,
    elapsedMs: Math.round(elapsedMs),
    requestsPerSecond: Number((requestCount / (elapsedMs / 1_000)).toFixed(2)),
    latencyMs: {
      min: Math.round(Math.min(...durations)),
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      max: Math.round(Math.max(...durations)),
    },
    averageResponseBytes: successful.length
      ? Math.round(
          successful.reduce((total, result) => total + result.bytes, 0) / successful.length,
        )
      : 0,
    p95BudgetMs,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.failed > 0 || report.latencyMs.p95 > p95BudgetMs) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
