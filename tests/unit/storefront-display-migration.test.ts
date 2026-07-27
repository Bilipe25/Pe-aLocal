import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260727180000_storefront_display_settings',
  'migration.sql',
);

describe('migration das preferências de exibição da vitrine', () => {
  it('usa defaults seguros e não publica endereços existentes', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('"showEstimatedTimeInHero" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"showFulfillmentInHero" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"showMinOrderValueInHero" BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('"showOpeningHoursInHero" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('"showFullAddressInStoreInfo" BOOLEAN NOT NULL DEFAULT false');
    expect(sql).toContain('Rollback');
    expect(sql).not.toMatch(/UPDATE\s+"StoreSettings"/i);
  });
});
