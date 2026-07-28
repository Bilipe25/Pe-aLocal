import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const directory = join(process.cwd(), 'prisma/migrations/20260727230000_checkout_v2_foundation');
const migration = readFileSync(join(directory, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(directory, 'rollback.sql'), 'utf8');
const publicTokenBackfillMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260727230100_order_public_token_expiry_backfill/migration.sql',
  ),
  'utf8',
);
const publicTokenIndexMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260727230200_order_public_token_expiry_index/migration.sql',
  ),
  'utf8',
);
const constraintValidationMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260727230300_checkout_v2_constraint_validation/migration.sql',
  ),
  'utf8',
);
const publicTokenNotNullMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260727230400_order_public_token_expiry_not_null/migration.sql',
  ),
  'utf8',
);

describe('checkout v2 foundation migration', () => {
  it('não repete nomes de constraints já adicionados pela cadeia de migrations', () => {
    const constraintMigrations = new Map<string, string[]>();
    const migrationsRoot = join(process.cwd(), 'prisma/migrations');

    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sql = readFileSync(join(migrationsRoot, entry.name, 'migration.sql'), 'utf8');
      for (const match of sql.matchAll(/ADD CONSTRAINT\s+"([^"]+)"/g)) {
        const owners = constraintMigrations.get(match[1]) ?? [];
        owners.push(entry.name);
        constraintMigrations.set(match[1], owners);
      }
    }

    expect([...constraintMigrations.entries()].filter(([, owners]) => owners.length > 1)).toEqual(
      [],
    );
  });

  it('é atômica, limitada e preserva compatibilidade operacional', () => {
    expect(migration.trimStart()).toMatch(/^[\s\S]*BEGIN;/);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain("SET LOCAL statement_timeout = '120s'");
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('ADD COLUMN "quoteFingerprint" VARCHAR(64)');
    expect(migration).toContain('ADD COLUMN "deliveryPostalCode" VARCHAR(8)');
    expect(migration).not.toMatch(/DROP COLUMN\s+"deliveryAddress"/);
    expect(migration).not.toMatch(/DROP COLUMN\s+"deliveryZoneName"/);
  });

  it('isola o índice da retenção pública em migration concorrente', () => {
    expect(migration).not.toContain('CREATE INDEX "orders_publicTokenExpiresAt_idx"');
    expect(publicTokenIndexMigration.match(/CONCURRENTLY/g)).toHaveLength(1);
    expect(publicTokenIndexMigration.match(/;/g)).toHaveLength(1);
    expect(publicTokenIndexMigration).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
    expect(publicTokenIndexMigration).not.toContain('IF NOT EXISTS');
  });

  it('faz um único backfill antes de validar e isola o lock de NOT NULL', () => {
    expect(migration).toContain('"orders_public_token_expiry_not_null_check"');
    expect(migration).not.toContain('ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL');
    expect(publicTokenBackfillMigration.match(/UPDATE "orders"/g)).toHaveLength(1);
    expect(publicTokenBackfillMigration).toContain('WHERE "publicTokenExpiresAt" IS NULL');
    expect(constraintValidationMigration).toContain(
      'VALIDATE CONSTRAINT "orders_public_token_expiry_not_null_check"',
    );
    expect(constraintValidationMigration).not.toContain(
      'ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL',
    );
    expect(publicTokenNotNullMigration).toContain(
      'ALTER COLUMN "publicTokenExpiresAt" SET NOT NULL',
    );
    expect(publicTokenNotNullMigration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(publicTokenNotNullMigration).toContain("SET LOCAL statement_timeout = '30s'");
    expect(publicTokenNotNullMigration.trimEnd()).toMatch(/COMMIT;$/);
  });

  it('atribui cupons apenas quando a loja é determinística', () => {
    expect(migration).toContain('HAVING COUNT(DISTINCT b."storeId") = 1');
    expect(migration).toContain('HAVING COUNT(*) = 1');
    expect(migration).toContain('WHERE "storeId" IS NULL');
    expect(migration).toContain('SET "isActive" = false');
    expect(migration).toContain('"coupons_active_requires_store_check"');
    expect(migration).toContain('"coupon_usages_couponId_orderId_key"');
    expect(migration).toContain('"coupon_usages_orderId_fkey"');
    expect(migration).toContain('orphan coupon usages reference missing orders');
  });

  it('protege faixas de CEP da Data API e mantém o escopo composto', () => {
    expect(migration).toContain('CREATE TABLE "delivery_zone_postal_ranges"');
    expect(migration).toContain('FOREIGN KEY ("deliveryZoneId", "tenantId", "storeId")');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain(
      'REVOKE ALL ON TABLE "delivery_zone_postal_ranges" FROM anon, authenticated',
    );
    expect(migration).toContain('"delivery_zone_postal_ranges_postal_codes_check"');
    expect(migration).toContain('CREATE TRIGGER "delivery_zone_postal_ranges_no_overlap"');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public."_prevent_delivery_postal_range_overlap"()',
    );
  });

  it('documenta rollback destrutivo, atômico e com preflight', () => {
    expect(rollback).toContain(
      'Operational rollback should normally deploy the previous application',
    );
    expect(rollback).toContain('Rollback blocked: duplicate coupon codes exist inside a tenant');
    expect(rollback).toContain('DROP TABLE IF EXISTS "delivery_zone_postal_ranges"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "publicTokenExpiresAt"');
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/);
  });
});
