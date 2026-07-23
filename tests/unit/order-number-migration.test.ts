import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectories = [
  '20260722013000_order_number_counter_expand',
  '20260722014000_order_number_counter_backfill',
  '20260722015000_order_number_counter_cutover',
] as const;
const migrations = migrationDirectories.map((directory) => readFileSync(
  join(process.cwd(), `prisma/migrations/${directory}/migration.sql`),
  'utf8',
));
const migration = migrations.join('\n');

describe('order number counter migration', () => {
  it('keeps each rollout step atomic and requires migration-first deployment', () => {
    for (const sql of migrations) {
      expect(sql.trimStart().match(/^(?:--[^\n]*\n)*BEGIN;/)?.[0]).toContain('BEGIN;');
      expect(sql.trimEnd()).toMatch(/COMMIT;\s*(?:\n--[^\n]*)*$/);
    }
    expect(migrations[0]).toContain('apply expand, backfill and cutover before publishing');
  });

  it('backfills each store with an indexed lookup and reconciles during cutover', () => {
    expect(migration).toContain('ORDER BY orders."orderNumber" DESC');
    expect(migration).toContain('GREATEST(counter."lastNumber", EXCLUDED."lastNumber")');
    expect(migration.match(/INSERT INTO public\.store_order_counters AS counter/g)).toHaveLength(3);
  });

  it('assigns numbers with a transactional per-store upsert', () => {
    expect(migration).toContain('INSERT INTO public.store_order_counters AS counter');
    expect(migration).toContain('ON CONFLICT ("storeId") DO UPDATE');
    expect(migration).toContain('counter."lastNumber" + 1');
    expect(migration).toContain('BEFORE INSERT ON public.orders');
  });

  it('rejects invalid or mutable order numbers', () => {
    expect(migration).toContain('CHECK ("orderNumber" > 0) NOT VALID');
    expect(migration).toContain('VALIDATE CONSTRAINT "orders_orderNumber_positive_check"');
    expect(migration).toContain('BEFORE UPDATE OF "storeId", "orderNumber" ON public.orders');
    expect(migration).toContain("ERRCODE = '23514'");
  });

  it('uses a bounded cutover lock in deadlock-safe order', () => {
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration.indexOf('LOCK TABLE public.stores')).toBeLessThan(
      migration.indexOf('LOCK TABLE public.orders'),
    );
  });

  it('keeps the internal counter unavailable through the Data API', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.store_order_counters FROM anon');
    expect(migration).toContain('REVOKE ALL ON TABLE public.store_order_counters FROM authenticated');
  });

  it('documents a rollback with the quoted mixed-case constraint', () => {
    expect(migration).toContain('DROP CONSTRAINT "orders_orderNumber_positive_check"');
  });
});
