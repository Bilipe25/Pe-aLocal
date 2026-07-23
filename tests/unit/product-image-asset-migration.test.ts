import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('prisma/migrations/20260723170000_product_image_asset_scope/migration.sql'),
  'utf8',
);

describe('migration de integridade da imagem de produto', () => {
  it('interrompe em dados inconsistentes e cria FK composta sem alterar registros', () => {
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('asset."assetType" <> \'PRODUCT_IMAGE\'');
    expect(sql).toContain('FOREIGN KEY ("imageAssetId", "tenantId", "storeId")');
    expect(sql).toContain('REFERENCES "store_assets"("id", "tenantId", "storeId")');
    expect(sql).not.toMatch(/UPDATE\s+"products"/i);
  });

  it('documenta rollback da constraint e do índice', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "products_image_asset_scope_fkey"');
    expect(sql).toContain('DROP INDEX IF EXISTS "products_imageAssetId_tenantId_storeId_idx"');
  });
});
