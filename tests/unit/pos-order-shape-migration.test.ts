import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260821210000_pos_order_shape/migration.sql'),
  'utf8',
);

describe('POS order shape migration', () => {
  it('replaces the legacy dining constraint atomically with bounded locks', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain("SET LOCAL statement_timeout = '30s'");
    expect(migration).toContain('DROP CONSTRAINT "orders_dine_in_shape_check"');
    expect(migration.trimEnd()).toMatch(/COMMIT;[\s\S]*$/);
  });

  it('allows the optional POS customer without weakening the storefront rule', () => {
    expect(migration.match(/"origin" = 'POS'/g)).toHaveLength(2);
    expect(migration).toContain('"customerPhone" IS NOT NULL');
    expect(migration).toContain('"paymentMethod" <> \'CARD_IN_PERSON\'');
  });

  it('keeps the dining, fulfillment and payment invariants', () => {
    expect(migration).toContain('"diningTableId" IS NOT NULL');
    expect(migration).toContain('"diningTableId" IS NULL');
    expect(migration).toContain('"deliveryFee" = 0');
    expect(migration).toContain('"status" <> \'OUT_FOR_DELIVERY\'');
    expect(migration).toContain('"status" <> \'DELIVERED\' OR "paymentStatus" = \'PAID\'');
  });

  it('validates existing rows before commit', () => {
    expect(migration).toContain(') NOT VALID;');
    expect(migration).toContain('VALIDATE CONSTRAINT "orders_dine_in_shape_check"');
  });
});
