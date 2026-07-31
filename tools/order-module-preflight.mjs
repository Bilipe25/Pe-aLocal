import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[ORDER_MODULE_PREFLIGHT_FAILED]', { kind: 'missing_database_url' });
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    const crossTenant = await client.query(`
      SELECT COUNT(*)::integer AS count
      FROM public.orders AS orders
      LEFT JOIN public.stores AS stores
        ON stores.id = orders."storeId"
      WHERE stores.id IS NULL
         OR stores."tenantId" IS DISTINCT FROM orders."tenantId"
    `);
    const internalNotesSecurity = await client.query(`
      SELECT
        table_config.relrowsecurity AS rls_enabled,
        EXISTS (
          SELECT 1
          FROM information_schema.role_table_grants AS grants
          WHERE grants.table_schema = 'public'
            AND grants.table_name = 'order_internal_notes'
            AND grants.grantee IN ('anon', 'authenticated', 'PUBLIC')
        ) AS has_public_grant
      FROM pg_class AS table_config
      JOIN pg_namespace AS table_namespace
        ON table_namespace.oid = table_config.relnamespace
      WHERE table_namespace.nspname = 'public'
        AND table_config.relname = 'order_internal_notes'
    `);
    const constraints = await client.query(`
      SELECT constraint_config.conname, constraint_config.convalidated
      FROM pg_constraint AS constraint_config
      WHERE constraint_config.conrelid = 'public.orders'::regclass
        AND constraint_config.conname = 'orders_storeId_tenantId_fkey'
    `);
    const snapshotColumns = await client.query(`
      SELECT table_name, column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'order_items' AND column_name = 'position')
          OR (
            table_name = 'order_item_options'
            AND column_name IN ('position', 'groupId', 'groupName', 'groupPosition')
          )
        )
    `);
    const snapshotConstraints = await client.query(`
      SELECT constraint_config.conname, constraint_config.convalidated
      FROM pg_constraint AS constraint_config
      WHERE constraint_config.conrelid IN (
        'public.order_items'::regclass,
        'public.order_item_options'::regclass
      )
        AND constraint_config.conname IN (
          'order_items_position_nonnegative_check',
          'order_item_options_position_nonnegative_check',
          'order_item_options_group_position_nonnegative_check',
          'order_item_options_group_snapshot_consistency_check'
        )
    `);
    const snapshotIntegrity = await client.query(`
      SELECT
        (SELECT COUNT(*)::integer FROM public.order_items WHERE "position" < 0)
          AS invalid_item_positions,
        (
          SELECT COUNT(*)::integer
          FROM public.order_item_options
          WHERE "position" < 0 OR "groupPosition" < 0
        ) AS invalid_option_positions,
        (
          SELECT COUNT(*)::integer
          FROM public.order_item_options
          WHERE ("groupId" IS NULL) IS DISTINCT FROM ("groupName" IS NULL)
        ) AS inconsistent_group_snapshots
    `);
    const indexes = await client.query(`
      SELECT index_class.relname, index_config.indisready, index_config.indisvalid
      FROM pg_index AS index_config
      JOIN pg_class AS index_class ON index_class.oid = index_config.indexrelid
      JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_class.relnamespace
      WHERE index_namespace.nspname = 'public'
        AND index_class.relname IN (
          'orders_customerId_idx',
          'orders_cancelledById_idx',
          'order_outbox_events_processed_retention_idx',
          'order_items_orderId_position_id_idx',
          'order_item_options_orderItemId_groupPosition_position_id_idx'
        )
      ORDER BY index_class.relname
    `);

    const crossTenantOrderCount = crossTenant.rows[0]?.count ?? -1;
    const security = internalNotesSecurity.rows[0];
    const tenantStoreConstraint = constraints.rows[0];
    const columnStatus = new Map(
      snapshotColumns.rows.map((column) => [`${column.table_name}.${column.column_name}`, column]),
    );
    const snapshotConstraintStatus = new Map(
      snapshotConstraints.rows.map((constraint) => [constraint.conname, constraint]),
    );
    const snapshotCounts = snapshotIntegrity.rows[0];
    const indexStatus = new Map(indexes.rows.map((row) => [row.relname, row]));
    const failures = [];

    if (crossTenantOrderCount !== 0) failures.push('cross_tenant_order_store_reference');
    if (!security?.rls_enabled) failures.push('internal_notes_rls_disabled');
    if (security?.has_public_grant) failures.push('internal_notes_public_grant');
    if (!tenantStoreConstraint?.convalidated) failures.push('tenant_store_constraint_missing');

    for (const [columnName, nullable, defaultExpected] of [
      ['order_items.position', false, true],
      ['order_item_options.position', false, true],
      ['order_item_options.groupPosition', false, true],
      ['order_item_options.groupId', true, false],
      ['order_item_options.groupName', true, false],
    ]) {
      const column = columnStatus.get(columnName);
      if (!column) {
        failures.push(`${columnName}_missing`);
        continue;
      }
      if ((column.is_nullable === 'YES') !== nullable) {
        failures.push(`${columnName}_nullability_invalid`);
      }
      if (defaultExpected && !String(column.column_default ?? '').includes('0')) {
        failures.push(`${columnName}_default_invalid`);
      }
    }

    for (const constraintName of [
      'order_items_position_nonnegative_check',
      'order_item_options_position_nonnegative_check',
      'order_item_options_group_position_nonnegative_check',
      'order_item_options_group_snapshot_consistency_check',
    ]) {
      if (!snapshotConstraintStatus.get(constraintName)?.convalidated) {
        failures.push(`${constraintName}_invalid`);
      }
    }

    if ((snapshotCounts?.invalid_item_positions ?? -1) !== 0) {
      failures.push('invalid_item_positions');
    }
    if ((snapshotCounts?.invalid_option_positions ?? -1) !== 0) {
      failures.push('invalid_option_positions');
    }
    if ((snapshotCounts?.inconsistent_group_snapshots ?? -1) !== 0) {
      failures.push('inconsistent_group_snapshots');
    }

    for (const indexName of [
      'orders_customerId_idx',
      'orders_cancelledById_idx',
      'order_outbox_events_processed_retention_idx',
      'order_items_orderId_position_id_idx',
      'order_item_options_orderItemId_groupPosition_position_id_idx',
    ]) {
      const index = indexStatus.get(indexName);
      if (!index?.indisready || !index?.indisvalid) failures.push(`${indexName}_invalid`);
    }

    console.info(
      JSON.stringify({
        event: 'order_module_preflight',
        crossTenantOrderCount,
        internalNotesRlsEnabled: Boolean(security?.rls_enabled),
        internalNotesHasPublicGrant: Boolean(security?.has_public_grant),
        tenantStoreConstraintValidated: Boolean(tenantStoreConstraint?.convalidated),
        snapshotColumns: Object.fromEntries(
          [...columnStatus].map(([name, column]) => [
            name,
            { nullable: column.is_nullable === 'YES', default: column.column_default ?? null },
          ]),
        ),
        snapshotConstraints: Object.fromEntries(
          [...snapshotConstraintStatus].map(([name, constraint]) => [
            name,
            { validated: Boolean(constraint.convalidated) },
          ]),
        ),
        snapshotIntegrity: {
          invalidItemPositions: snapshotCounts?.invalid_item_positions ?? -1,
          invalidOptionPositions: snapshotCounts?.invalid_option_positions ?? -1,
          inconsistentGroupSnapshots: snapshotCounts?.inconsistent_group_snapshots ?? -1,
        },
        indexes: Object.fromEntries(
          [...indexStatus].map(([name, index]) => [
            name,
            { ready: Boolean(index.indisready), valid: Boolean(index.indisvalid) },
          ]),
        ),
        failures,
      }),
    );

    if (failures.length > 0) process.exitCode = 1;
    await client.query('ROLLBACK');
  } catch (error) {
    console.error('[ORDER_MODULE_PREFLIGHT_FAILED]', {
      kind: error instanceof Error ? error.name : 'non_error',
    });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
