import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('prisma/migrations/20260730100000_storefront_commercial_sections/migration.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve('prisma/migrations/20260730100000_storefront_commercial_sections/rollback.sql'),
  'utf8',
);

describe('migration das vitrines comerciais do storefront', () => {
  it('preserva Destaques e ativa recentes sem publicar dados quando não há reconhecimento', () => {
    expect(migration).toContain(
      'ADD COLUMN "showRecentPurchasesSection" BOOLEAN NOT NULL DEFAULT true',
    );
    expect(migration).toContain(
      'ADD COLUMN "showFeaturedProductsSection" BOOLEAN NOT NULL DEFAULT true',
    );
    expect(migration).not.toMatch(/UPDATE\s+"StoreSettings"/i);
  });

  it('documenta rollback limitado às duas preferências novas', () => {
    expect(rollback).toContain('DROP COLUMN IF EXISTS "showRecentPurchasesSection"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "showFeaturedProductsSection"');
    expect(rollback).not.toMatch(/DROP TABLE/i);
  });
});
