import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const benchmark = readFileSync(join(process.cwd(), 'tools/order-query-benchmark.mjs'), 'utf8');

describe('order query benchmark safety', () => {
  it('requires an explicit staging identity and runs inside a read-only transaction', () => {
    expect(benchmark).toContain('ORDER_PERF_ACKNOWLEDGE_STAGING');
    expect(benchmark).toContain('ORDER_PERF_PROJECT_REF');
    expect(benchmark).toContain('assertStagingConnection');
    expect(benchmark).toContain("client.query('BEGIN READ ONLY')");
    expect(benchmark).toContain('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)');
  });

  it('reports database and network timings separately and covers item previews', () => {
    expect(benchmark).toContain('databaseExecutionMs');
    expect(benchmark).toContain('clientRoundTripMs');
    expect(benchmark).toContain("name: 'board-item-preview'");
    expect(benchmark).toContain('sequentialScans');
  });
});
