import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationRoot = join(process.cwd(), 'prisma/migrations');
const readMigration = (name: string) =>
  readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');

const expand = readMigration('20260731104000_order_item_snapshot_expand');
const backfill = readMigration('20260731105000_order_item_snapshot_backfill');
const guard = readMigration('20260731106000_order_item_snapshot_guard');
const itemIndex = readMigration('20260731107000_order_item_position_index');
const optionIndex = readMigration('20260731108000_order_item_option_position_index');
const itemCleanup = readMigration('20260731109000_order_item_legacy_index_cleanup');
const optionCleanup = readMigration('20260731110000_order_item_option_legacy_index_cleanup');
const rollback = readFileSync(
  join(migrationRoot, '20260731104000_order_item_snapshot_expand', 'rollback.sql'),
  'utf8',
);

describe('snapshot ordenado dos itens do pedido', () => {
  it('expande o schema com defaults compatíveis com a aplicação anterior', () => {
    expect(expand).toContain('ADD COLUMN "position" INTEGER DEFAULT 0');
    expect(expand).toContain('ADD COLUMN "groupId" TEXT');
    expect(expand).toContain('ADD COLUMN "groupName" TEXT');
    expect(expand).toContain('ADD COLUMN "groupPosition" INTEGER DEFAULT 0');
  });

  it('faz backfill determinístico sem inventar grupos para o histórico legado', () => {
    expect(backfill).toContain('PARTITION BY "orderId" ORDER BY "id"');
    expect(backfill).toContain('PARTITION BY "orderItemId" ORDER BY "id"');
    expect(backfill).toContain('"groupPosition" = 0');
    expect(backfill).not.toMatch(/SET\s+"group(?:Id|Name)"/i);
  });

  it('valida posições e a consistência do snapshot antes de tornar campos obrigatórios', () => {
    expect(guard).toContain('CHECK ("position" >= 0) NOT VALID');
    expect(guard).toContain('CHECK ("groupPosition" >= 0) NOT VALID');
    expect(guard).toContain('"groupId" IS NULL AND "groupName" IS NULL');
    expect(guard).toContain('VALIDATE CONSTRAINT');
    expect(guard.indexOf('VALIDATE CONSTRAINT')).toBeLessThan(
      guard.indexOf('ALTER COLUMN "position" SET NOT NULL'),
    );
  });

  it.each([
    ['order_items_orderId_position_id_idx', itemIndex],
    ['order_item_options_orderItemId_groupPosition_position_id_idx', optionIndex],
  ])('isola a criação concorrente do índice %s', (indexName, sql) => {
    expect(sql).toContain(`CREATE INDEX CONCURRENTLY "${indexName}"`);
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
  });

  it('remove os índices redundantes somente depois dos substitutos ordenados', () => {
    expect(itemCleanup).toContain('DROP INDEX CONCURRENTLY public."order_items_orderId_idx"');
    expect(optionCleanup).toContain(
      'DROP INDEX CONCURRENTLY public."order_item_options_orderItemId_idx"',
    );
  });

  it('documenta rollback físico destrutivo separado do rollback operacional', () => {
    expect(rollback).toContain('Operational rollback');
    expect(rollback).toContain('Physical rollback is destructive');
    expect(rollback).toContain('CREATE INDEX IF NOT EXISTS "order_items_orderId_idx"');
    expect(rollback).toContain('DROP COLUMN IF EXISTS "groupName"');
  });
});
