import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  parseCleanupOptions,
  runCustomerRecognitionCleanup,
} from '../../tools/customer-recognition-cleanup.mjs';

const cleanup = readFileSync(resolve('tools/customer-recognition-cleanup.mjs'), 'utf8');
const packageJson = readFileSync(resolve('package.json'), 'utf8');
const rollout = readFileSync(resolve('docs/customer-recognition-rollout.md'), 'utf8');

describe('customer recognition cleanup', () => {
  it('é somente leitura por padrão e exige limites operacionais seguros', () => {
    expect(parseCleanupOptions([])).toEqual({
      apply: false,
      batchSize: 500,
      maxBatches: 20,
      graceMinutes: 60,
    });
    expect(
      parseCleanupOptions([
        '--',
        '--apply',
        '--batch-size=250',
        '--max-batches=5',
        '--grace-minutes=120',
      ]),
    ).toEqual({ apply: true, batchSize: 250, maxBatches: 5, graceMinutes: 120 });
    expect(() => parseCleanupOptions(['--batch-size=1'])).toThrow('invalid_batch_size');
    expect(() => parseCleanupOptions(['--grace-minutes=0'])).toThrow('invalid_grace_minutes');
    expect(() => parseCleanupOptions(['--typo'])).toThrow('unknown_argument');
  });

  it('usa lotes transacionais sem bloquear linhas ocupadas', () => {
    expect(cleanup).toContain('FOR UPDATE SKIP LOCKED');
    expect(cleanup).toContain("SET LOCAL lock_timeout = '2s'");
    expect(cleanup).toContain("SET LOCAL statement_timeout = '30s'");
    expect(cleanup).toContain('pg_try_advisory_lock');
    expect(cleanup).toContain('pg_advisory_unlock');
    expect(cleanup).toContain('cascaded_reference_count');
  });

  it('não usa o pool de runtime nem registra material sensível', () => {
    expect(cleanup).toContain('const connectionString = process.env.DIRECT_URL');
    expect(cleanup).not.toContain('process.env.DATABASE_URL');
    expect(cleanup).not.toMatch(
      /console\.(?:info|error)[\s\S]{0,160}(?:tokenHash|referenceHash|keyHash)/,
    );
    expect(cleanup).not.toMatch(/RETURNING\s+(?:\w+\.)?id/i);
    expect(packageJson).toContain('db:customer-recognition:cleanup');
    expect(rollout).toContain('modo somente leitura');
    expect(rollout).toContain('--apply');
  });

  it('não inicia limpeza quando outro job possui o lock', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ acquired: false }] });

    await expect(
      runCustomerRecognitionCleanup({
        client: { query },
        options: parseCleanupOptions(['--apply']),
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'already_running' });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [
      'pedidolocal:customer-recognition-cleanup',
    ]);
  });

  it('faz dry-run em transação read-only e retorna apenas contagens', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            expired_references: '7',
            expired_sessions: '3',
            expired_throttles: '5',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      runCustomerRecognitionCleanup({
        client: { query },
        options: parseCleanupOptions([]),
      }),
    ).resolves.toEqual({
      status: 'dry_run',
      graceMinutes: 60,
      eligible: { references: '7', sessions: '3', throttles: '5' },
    });

    expect(query.mock.calls.map(([statement]) => statement)).toEqual(
      expect.arrayContaining(['BEGIN TRANSACTION READ ONLY', 'ROLLBACK']),
    );
  });

  it('apaga cada recurso em uma transação curta e contabiliza cascades', async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired: true }] };
      }
      if (statement.includes('DELETE FROM public.checkout_recognition_address_references')) {
        return { rows: [{ deleted_count: 2 }] };
      }
      if (statement.includes('DELETE FROM public.checkout_recognition_sessions')) {
        return { rows: [{ deleted_count: 1, cascaded_reference_count: 3 }] };
      }
      if (statement.includes('DELETE FROM public.customer_recognition_throttles')) {
        return { rows: [{ deleted_count: 4 }] };
      }
      return { rows: [] };
    });

    await expect(
      runCustomerRecognitionCleanup({
        client: { query },
        options: parseCleanupOptions(['--apply']),
      }),
    ).resolves.toEqual({
      status: 'applied',
      graceMinutes: 60,
      batchSize: 500,
      maxBatches: 20,
      deleted: { references: 5, sessions: 1, throttles: 4 },
      batches: { references: 1, sessions: 1, throttles: 1 },
      batchLimitReached: false,
    });

    expect(query.mock.calls.filter(([statement]) => statement === 'BEGIN')).toHaveLength(3);
    expect(query.mock.calls.filter(([statement]) => statement === 'COMMIT')).toHaveLength(3);
    expect(query.mock.calls.at(-1)).toEqual([
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['pedidolocal:customer-recognition-cleanup'],
    ]);
  });
});
