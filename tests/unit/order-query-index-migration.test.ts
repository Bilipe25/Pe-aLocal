import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readMigration = (directory: string) =>
  readFileSync(join(process.cwd(), `prisma/migrations/${directory}/migration.sql`), 'utf8');

const backfillMigration = readMigration('20260722003000_order_query_indexes');
const concurrentMigrationDirectories = [
  '20260722003100_order_tenant_store_created_index',
  '20260722003200_order_store_status_created_index',
  '20260722003300_order_store_payment_created_index',
  '20260722003400_order_store_status_changed_index',
  '20260722003500_order_store_phone_created_index',
  '20260722003600_order_status_history_created_index',
  '20260722003700_drop_legacy_order_status_history_index',
] as const;
const concurrentMigrations = concurrentMigrationDirectories.map(readMigration);

describe('order query index migrations', () => {
  it('finishes the phone backfill before building indexes', () => {
    expect(backfillMigration).toContain('ADD COLUMN IF NOT EXISTS "customerPhoneNormalized" TEXT');
    expect(backfillMigration.match(/UPDATE "orders"/g)).toHaveLength(8);
    expect(backfillMigration).toContain('DROP FUNCTION "_normalize_order_phone"(TEXT)');
    expect(backfillMigration).not.toContain('CONCURRENTLY');
  });

  it('isolates every concurrent operation in a single-statement migration', () => {
    for (const sql of concurrentMigrations) {
      expect(sql.match(/CONCURRENTLY/g)).toHaveLength(1);
      expect(sql.match(/;/g)).toHaveLength(1);
      expect(sql).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
    }
  });

  it('creates all replacement indexes before dropping the legacy index', () => {
    const migration = concurrentMigrations.join('\n');

    expect(migration.match(/CREATE INDEX CONCURRENTLY/g)).toHaveLength(6);
    expect(migration).toContain('"orders_tenantId_storeId_createdAt_id_idx"');
    expect(migration).toContain('"orders_storeId_status_createdAt_id_idx"');
    expect(migration).toContain('"orders_storeId_paymentStatus_createdAt_id_idx"');
    expect(migration).toContain('"orders_storeId_status_statusChangedAt_id_idx"');
    expect(migration).toContain('"orders_storeId_customerPhoneNormalized_createdAt_id_idx"');
    expect(migration).toContain('"order_status_history_orderId_createdAt_id_idx"');
    expect(concurrentMigrations.at(-1)).toContain(
      'DROP INDEX CONCURRENTLY IF EXISTS "order_status_history_orderId_createdAt_idx"',
    );
  });
});
