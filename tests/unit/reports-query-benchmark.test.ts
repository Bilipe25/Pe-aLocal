import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const benchmark = readFileSync(join(process.cwd(), 'tools/reports-query-benchmark.mjs'), 'utf8');

describe('reports query benchmark safety', () => {
  it('exige identidade explícita de staging e uma transação somente de leitura', () => {
    expect(benchmark).toContain('REPORTS_PERF_ACKNOWLEDGE_STAGING');
    expect(benchmark).toContain('REPORTS_PERF_PROJECT_REF');
    expect(benchmark).toContain('assertStagingConnection');
    expect(benchmark).toContain("client.query('BEGIN READ ONLY')");
    expect(benchmark).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)');
  });

  it('cobre as agregações críticas de V2 e separa execução do banco do round-trip', () => {
    expect(benchmark).toContain("name: 'reports-summary'");
    expect(benchmark).toContain("name: 'reports-weekly-series'");
    expect(benchmark).toContain("name: 'reports-product-trends'");
    expect(benchmark).toContain("name: 'reports-durations'");
    expect(benchmark).toContain("name: 'reports-hour-distribution'");
    expect(benchmark).toContain("name: 'reports-durations-by-hour'");
    expect(benchmark).toContain("name: 'reports-modalities'");
    expect(benchmark).toContain("name: 'reports-sla-orders'");
    expect(benchmark).toContain('COUNT(DISTINCT alerts."orderId")');
    expect(benchmark).toContain('databaseExecutionMs');
    expect(benchmark).toContain('clientRoundTripMs');
    expect(benchmark).toContain('sequentialScans');
  });
});
