import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260809183000_order_item_image_snapshot',
  'migration.sql',
);

describe('migration do snapshot de imagem do pedido', () => {
  it('adiciona, preenche e indexa os campos sem remover dados existentes', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ADD COLUMN "imageUrl" TEXT');
    expect(sql).toContain('ADD COLUMN "imageAssetId" TEXT');
    expect(sql).toContain('UPDATE "order_items" AS item');
    expect(sql).toContain('product."tenantId" = orders."tenantId"');
    expect(sql).toContain('product."storeId" = orders."storeId"');
    expect(sql).toContain('CREATE INDEX "order_items_imageAssetId_idx"');
    expect(sql).not.toContain('DROP TABLE');
  });
});
