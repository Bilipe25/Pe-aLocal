import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[CHECKOUT_V2_PREFLIGHT_FAILED]', { kind: 'missing_database_url' });
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    const foundation = await client.query(`
      SELECT
        to_regclass('public.delivery_zone_postal_ranges') IS NOT NULL AS has_postal_ranges,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'coupons'
            AND column_name = 'storeId'
        ) AS has_coupon_store,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'orders'
            AND column_name = 'publicTokenExpiresAt'
        ) AS has_public_token_expiry
    `);
    const schema = foundation.rows[0];
    if (!schema.has_postal_ranges || !schema.has_coupon_store || !schema.has_public_token_expiry) {
      console.error('[CHECKOUT_V2_PREFLIGHT_FAILED]', { kind: 'foundation_not_applied' });
      process.exitCode = 1;
    } else {
      // `pg` serializa comandos por conexao e descontinuou o uso concorrente
      // de `client.query()`. Manter as leituras sequenciais também deixa o
      // snapshot READ ONLY mais previsível durante o gate de deploy.
      const delivery = await client.query(`
            SELECT
              COUNT(*)::integer AS total,
              COALESCE(
                array_agg(store.slug ORDER BY store.slug)
                  FILTER (WHERE NOT EXISTS (
                    SELECT 1
                    FROM delivery_zones zone
                    JOIN delivery_zone_postal_ranges range
                      ON range."deliveryZoneId" = zone.id
                     AND range."tenantId" = zone."tenantId"
                     AND range."storeId" = zone."storeId"
                     AND range."isActive"
                    WHERE zone."tenantId" = store."tenantId"
                      AND zone."storeId" = store.id
                      AND zone."isActive"
                  )),
                ARRAY[]::text[]
              ) AS missing_slugs
            FROM stores store
            JOIN store_settings settings ON settings."storeId" = store.id
            WHERE store."isActive"
              AND settings."deliveryEnabled"
          `);
      const coupons = await client.query(`
            SELECT COUNT(*)::integer AS active_without_store
            FROM coupons
            WHERE "isActive" AND "storeId" IS NULL
          `);
      const orders = await client.query(`
            SELECT
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE "publicTokenExpiresAt" IS NULL)::bigint AS expiry_nulls,
              pg_total_relation_size('public.orders')::bigint AS table_bytes
            FROM orders
          `);
      const tokenIndex = await client.query(`
            SELECT index_config.indisready, index_config.indisvalid
            FROM pg_index index_config
            JOIN pg_class index_class ON index_class.oid = index_config.indexrelid
            JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
            WHERE index_namespace.nspname = 'public'
              AND index_class.relname = 'orders_publicTokenExpiresAt_idx'
          `);
      const invalidConstraints = await client.query(`
            SELECT constraint_config.conname
            FROM pg_constraint constraint_config
            WHERE constraint_config.conrelid = ANY (
              ARRAY[
                'public.orders'::regclass,
                'public.order_items'::regclass,
                'public.order_item_options'::regclass,
                'public.delivery_zones'::regclass,
                'public.coupons'::regclass,
                'public.coupon_usages'::regclass
              ]
            )
              AND NOT constraint_config.convalidated
            ORDER BY constraint_config.conname
          `);
      const notNull = await client.query(`
            SELECT attribute.attnotnull
            FROM pg_attribute attribute
            WHERE attribute.attrelid = 'public.orders'::regclass
              AND attribute.attname = 'publicTokenExpiresAt'
              AND NOT attribute.attisdropped
          `);

      const missingDeliveryStoreSlugs = delivery.rows[0].missing_slugs;
      const indexReady = tokenIndex.rows.length === 1 && tokenIndex.rows[0].indisready;
      const indexValid = tokenIndex.rows.length === 1 && tokenIndex.rows[0].indisvalid;
      const expiryNotNull = notNull.rows.length === 1 && notNull.rows[0].attnotnull;
      const failures = [];

      if (missingDeliveryStoreSlugs.length > 0) failures.push('delivery_coverage_missing');
      if (coupons.rows[0].active_without_store > 0) failures.push('active_coupon_without_store');
      if (Number(orders.rows[0].expiry_nulls) > 0) failures.push('public_token_expiry_null');
      if (!indexReady || !indexValid) failures.push('public_token_expiry_index_invalid');
      if (invalidConstraints.rows.length > 0) failures.push('constraints_not_validated');
      if (!expiryNotNull) failures.push('public_token_expiry_nullable');

      const report = {
        event: 'checkout_v2_preflight',
        deliveryEnabledStoreCount: delivery.rows[0].total,
        missingDeliveryStoreSlugs,
        activeCouponWithoutStoreCount: coupons.rows[0].active_without_store,
        orderCount: orders.rows[0].total,
        ordersTableBytes: orders.rows[0].table_bytes,
        tokenExpiryIndexReady: Boolean(indexReady),
        tokenExpiryIndexValid: Boolean(indexValid),
        tokenExpiryNotNull: Boolean(expiryNotNull),
        invalidConstraints: invalidConstraints.rows.map((row) => row.conname),
        failures,
      };

      console.info(JSON.stringify(report));
      if (failures.length > 0) process.exitCode = 1;
    }

    await client.query('ROLLBACK');
  } catch (error) {
    console.error('[CHECKOUT_V2_PREFLIGHT_FAILED]', {
      kind: error instanceof Error ? error.name : 'non_error',
    });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
