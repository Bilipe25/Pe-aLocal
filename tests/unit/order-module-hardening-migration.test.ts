import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migrationRoot = join(process.cwd(), 'prisma/migrations');
const integrity = readFileSync(
  join(migrationRoot, '20260731100000_order_module_integrity/migration.sql'),
  'utf8',
);
const rollback = readFileSync(
  join(migrationRoot, '20260731100000_order_module_integrity/rollback.sql'),
  'utf8',
);
const customerIndex = readFileSync(
  join(migrationRoot, '20260731101000_order_customer_fk_index/migration.sql'),
  'utf8',
);
const cancelledByIndex = readFileSync(
  join(migrationRoot, '20260731102000_order_cancelled_by_fk_index/migration.sql'),
  'utf8',
);
const outboxRetentionIndex = readFileSync(
  join(migrationRoot, '20260731103000_order_outbox_processed_retention_index/migration.sql'),
  'utf8',
);
const preflight = readFileSync(join(process.cwd(), 'tools/order-module-preflight.mjs'), 'utf8');

describe('hardening do módulo de pedidos', () => {
  it('protege observações internas da Data API sem criar policy permissiva', () => {
    expect(integrity).toContain(
      'ALTER TABLE public.order_internal_notes ENABLE ROW LEVEL SECURITY',
    );
    expect(integrity).toContain(
      'REVOKE ALL ON TABLE public.order_internal_notes FROM PUBLIC, anon, authenticated',
    );
    expect(integrity).not.toMatch(/CREATE\s+POLICY/i);
  });

  it('bloqueia escopo cruzado antes de substituir a FK simples pela composta', () => {
    expect(integrity).toContain('stores."tenantId" IS DISTINCT FROM orders."tenantId"');
    expect(integrity).toContain('ADD CONSTRAINT "orders_storeId_tenantId_fkey"');
    expect(integrity).toContain('FOREIGN KEY ("storeId", "tenantId")');
    expect(integrity).toContain('NOT VALID');
    expect(integrity).toContain('VALIDATE CONSTRAINT "orders_storeId_tenantId_fkey"');
    expect(integrity.indexOf('VALIDATE CONSTRAINT "orders_storeId_tenantId_fkey"')).toBeLessThan(
      integrity.indexOf('DROP CONSTRAINT "orders_storeId_fkey"'),
    );
  });

  it('mantém rollback compatível sem enfraquecer RLS', () => {
    expect(rollback).toContain('ADD CONSTRAINT "orders_storeId_fkey"');
    expect(rollback).toContain('DROP CONSTRAINT "orders_storeId_tenantId_fkey"');
    expect(rollback).not.toContain('DISABLE ROW LEVEL SECURITY');
    expect(rollback).not.toMatch(/GRANT\s+ALL/i);
  });

  it.each([
    ['orders_customerId_idx', customerIndex],
    ['orders_cancelledById_idx', cancelledByIndex],
    ['order_outbox_events_processed_retention_idx', outboxRetentionIndex],
  ])('isola o índice %s em uma migration concorrente', (indexName, sql) => {
    expect(sql).toContain(`CREATE INDEX CONCURRENTLY "${indexName}"`);
    expect(sql.match(/CONCURRENTLY/g)).toHaveLength(1);
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\b(?:BEGIN|COMMIT)\b/);
    expect(sql).not.toContain('IF NOT EXISTS');
  });

  it('limita o índice de retenção aos eventos processados', () => {
    expect(outboxRetentionIndex).toContain('ON public.order_outbox_events("processedAt")');
    expect(outboxRetentionIndex).toContain(
      `WHERE "status" = 'PROCESSED' AND "processedAt" IS NOT NULL`,
    );
  });

  it('mantém o preflight read-only e cobre RLS, grants, FK e índices', () => {
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY');
    expect(preflight).toContain('stores."tenantId" IS DISTINCT FROM orders."tenantId"');
    expect(preflight).toContain('table_config.relrowsecurity');
    expect(preflight).toContain('information_schema.role_table_grants');
    expect(preflight).toContain('orders_storeId_tenantId_fkey');
    expect(preflight).toContain('order_outbox_events_processed_retention_idx');
    expect(preflight).toContain('order_items_orderId_position_id_idx');
    expect(preflight).toContain('order_item_options_orderItemId_groupPosition_position_id_idx');
    expect(preflight).toContain('inconsistent_group_snapshots');
    expect(preflight).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  });
});
