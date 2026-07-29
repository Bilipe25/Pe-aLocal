import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const beforeMigrate = process.argv.includes('--before-migrate');

if (!connectionString) {
  console.error('[CUSTOMER_RECOGNITION_PREFLIGHT_FAILED]', { kind: 'missing_database_url' });
  process.exitCode = 1;
} else {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");

    const foundation = await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'customers'
            AND column_name = 'phoneNormalized'
        ) AS has_phone_normalized,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'customer_addresses'
            AND column_name = 'addressFingerprint'
        ) AS has_address_fingerprint,
        to_regclass('public.customer_address_store_uses') IS NOT NULL AS has_store_uses,
        to_regclass('public.checkout_recognition_sessions') IS NOT NULL AS has_sessions,
        to_regclass('public.checkout_recognition_address_references') IS NOT NULL AS has_references,
        to_regclass('public.customer_recognition_throttles') IS NOT NULL AS has_throttles,
        to_regclass('public.storefront_devices') IS NOT NULL AS has_devices,
        to_regclass('public.customer_device_recognitions') IS NOT NULL AS has_device_recognitions,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'checkout_recognition_sessions'
            AND column_name = 'deviceRecognitionId'
        ) AS has_session_device_recognition
    `);

    const schema = foundation.rows[0];
    const foundationApplied = Object.values(schema).every(Boolean);
    const failures = [];

    if (!foundationApplied && beforeMigrate) {
      const legacyCustomers = await client.query(`
        WITH normalized AS (
          SELECT
            "tenantId",
            CASE
              WHEN length(regexp_replace(phone, '\\D', '', 'g')) IN (10, 11)
                THEN '55' || regexp_replace(phone, '\\D', '', 'g')
              ELSE regexp_replace(phone, '\\D', '', 'g')
            END AS phone_normalized
          FROM customers
        )
        SELECT
          COUNT(*) FILTER (
            WHERE phone_normalized !~ '^55[1-9]{2}[2-9][0-9]{7,8}$'
          )::bigint AS invalid_phone_count,
          (
            SELECT COUNT(*)::integer
            FROM (
              SELECT "tenantId", phone_normalized
              FROM normalized
              GROUP BY "tenantId", phone_normalized
              HAVING COUNT(*) > 1
            ) duplicated
          ) AS duplicate_group_count
        FROM normalized
      `);
      const legacyAddresses = await client.query(`
        WITH normalized AS (
          SELECT
            "customerId",
            concat_ws(
              chr(31),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("street", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("number", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("complement", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("neighborhood", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("city", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(lower(btrim(regexp_replace(normalize(COALESCE("state", ''), NFKD), U&'[\\0300-\\036f]', '', 'g'))), '\\s+', ' ', 'g'),
              regexp_replace(COALESCE("zipCode", ''), '\\D', '', 'g')
            ) AS canonical_address,
            "isDefault"
          FROM customer_addresses
        )
        SELECT
          (
            SELECT COUNT(*)::integer
            FROM (
              SELECT "customerId", canonical_address
              FROM normalized
              GROUP BY "customerId", canonical_address
              HAVING COUNT(*) > 1
            ) duplicated
          ) AS duplicate_group_count,
          (
            SELECT COUNT(*)::integer
            FROM (
              SELECT "customerId"
              FROM normalized
              WHERE "isDefault"
              GROUP BY "customerId"
              HAVING COUNT(*) > 1
            ) duplicated
          ) AS multiple_default_count
      `);
      const legacyOrderMismatches = await client.query(`
        SELECT COUNT(*)::bigint AS total
        FROM orders orders
        JOIN customers customer ON customer.id = orders."customerId"
        WHERE orders."tenantId" <> customer."tenantId"
      `);

      if (Number(legacyCustomers.rows[0].invalid_phone_count) > 0) {
        failures.push('invalid_legacy_customer_phone');
      }
      if (legacyCustomers.rows[0].duplicate_group_count > 0) {
        failures.push('duplicate_legacy_normalized_customer_phone');
      }
      if (legacyAddresses.rows[0].duplicate_group_count > 0) {
        failures.push('duplicate_legacy_customer_address');
      }
      if (legacyAddresses.rows[0].multiple_default_count > 0) {
        failures.push('multiple_legacy_default_addresses');
      }
      if (Number(legacyOrderMismatches.rows[0].total) > 0) {
        failures.push('legacy_order_customer_tenant_mismatch');
      }

      console.info(
        JSON.stringify({
          event: 'customer_recognition_preflight',
          phase: 'before_migrate',
          foundationApplied: false,
          invalidLegacyCustomerPhoneCount: legacyCustomers.rows[0].invalid_phone_count,
          duplicateLegacyPhoneGroupCount: legacyCustomers.rows[0].duplicate_group_count,
          duplicateLegacyAddressGroupCount: legacyAddresses.rows[0].duplicate_group_count,
          multipleLegacyDefaultAddressCustomerCount: legacyAddresses.rows[0].multiple_default_count,
          legacyOrderCustomerTenantMismatchCount: legacyOrderMismatches.rows[0].total,
          failures,
        }),
      );
      if (failures.length > 0) process.exitCode = 1;
    } else if (!foundationApplied) {
      failures.push('foundation_not_applied');
      console.info(
        JSON.stringify({
          event: 'customer_recognition_preflight',
          phase: 'after_migrate',
          foundationApplied: false,
          failures,
        }),
      );
      process.exitCode = 1;
    } else {
      // Queries remain sequential on one read-only snapshot. Reports contain
      // only aggregate counts and database object names, never personal data.
      const customers = await client.query(`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (
            WHERE "phoneNormalized" IS NULL
               OR "phoneNormalized" !~ '^55[1-9]{2}[2-9][0-9]{7,8}$'
          )::bigint AS invalid_phone_count
        FROM customers
      `);
      const duplicatePhones = await client.query(`
        SELECT COUNT(*)::integer AS duplicate_group_count
        FROM (
          SELECT "tenantId", "phoneNormalized"
          FROM customers
          GROUP BY "tenantId", "phoneNormalized"
          HAVING COUNT(*) > 1
        ) duplicated
      `);
      const addresses = await client.query(`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (
            WHERE address."tenantId" IS NULL
               OR address."updatedAt" IS NULL
               OR address."addressFingerprint" IS NULL
               OR address."addressFingerprint" !~ '^[0-9a-f]{64}$'
          )::bigint AS incomplete_count,
          COUNT(*) FILTER (
            WHERE customer."id" IS NULL
               OR customer."tenantId" <> address."tenantId"
          )::bigint AS tenant_mismatch_count
        FROM customer_addresses address
        LEFT JOIN customers customer ON customer."id" = address."customerId"
      `);
      const duplicateAddresses = await client.query(`
        SELECT COUNT(*)::integer AS duplicate_group_count
        FROM (
          SELECT "customerId", "addressFingerprint"
          FROM customer_addresses
          GROUP BY "customerId", "addressFingerprint"
          HAVING COUNT(*) > 1
        ) duplicated
      `);
      const multipleDefaults = await client.query(`
        SELECT COUNT(*)::integer AS customer_count
        FROM (
          SELECT "customerId"
          FROM customer_addresses
          WHERE "isDefault"
          GROUP BY "customerId"
          HAVING COUNT(*) > 1
        ) duplicated
      `);
      const orderTenantMismatches = await client.query(`
        SELECT COUNT(*)::bigint AS total
        FROM orders orders
        JOIN customers customer ON customer.id = orders."customerId"
        WHERE orders."tenantId" <> customer."tenantId"
      `);
      const storeUseMismatches = await client.query(`
        SELECT COUNT(*)::bigint AS total
        FROM customer_address_store_uses usage
        LEFT JOIN customer_addresses address
          ON address.id = usage."customerAddressId"
         AND address."tenantId" = usage."tenantId"
        LEFT JOIN stores store
          ON store.id = usage."storeId"
         AND store."tenantId" = usage."tenantId"
        LEFT JOIN delivery_zones zone
          ON zone.id = usage."deliveryZoneId"
         AND zone."tenantId" = usage."tenantId"
         AND zone."storeId" = usage."storeId"
        WHERE address.id IS NULL OR store.id IS NULL OR zone.id IS NULL
      `);
      const devices = await client.query(`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (
            WHERE "tokenHash" !~ '^[0-9a-f]{64}$'
               OR "expiresAt" <= "createdAt"
          )::bigint AS invalid_count
        FROM storefront_devices
      `);
      const deviceRecognitionMismatches = await client.query(`
        SELECT COUNT(*)::bigint AS total
        FROM customer_device_recognitions recognition
        LEFT JOIN storefront_devices device
          ON device.id = recognition."storefrontDeviceId"
        LEFT JOIN stores store
          ON store.id = recognition."storeId"
         AND store."tenantId" = recognition."tenantId"
        LEFT JOIN customers customer
          ON customer.id = recognition."customerId"
         AND customer."tenantId" = recognition."tenantId"
        WHERE device.id IS NULL
           OR store.id IS NULL
           OR customer.id IS NULL
           OR recognition."expiresAt" <= recognition."createdAt"
      `);
      const excessiveActiveDevices = await client.query(`
        SELECT COUNT(*)::integer AS customer_store_count
        FROM (
          SELECT "tenantId", "storeId", "customerId"
          FROM customer_device_recognitions
          WHERE "revokedAt" IS NULL
            AND "expiresAt" > clock_timestamp()
          GROUP BY "tenantId", "storeId", "customerId"
          HAVING COUNT(*) > 5
        ) excessive
      `);
      const sessionDeviceMismatches = await client.query(`
        SELECT COUNT(*)::bigint AS total
        FROM checkout_recognition_sessions session
        JOIN customer_device_recognitions recognition
          ON recognition.id = session."deviceRecognitionId"
        WHERE recognition."tenantId" <> session."tenantId"
           OR recognition."storeId" <> session."storeId"
           OR recognition."customerId" <> session."customerId"
      `);
      const invalidIndexes = await client.query(`
        SELECT expected.name
        FROM unnest(ARRAY[
          'customers_id_tenantId_key',
          'customers_tenantId_phoneNormalized_key',
          'customer_addresses_id_tenantId_key',
          'customer_addresses_customerId_addressFingerprint_key',
          'customer_addresses_one_default_per_customer_key',
          'customer_addresses_tenantId_idx',
          'storefront_devices_tokenHash_key',
          'storefront_devices_expiresAt_idx',
          'customer_device_recognitions_storefrontDeviceId_storeId_key',
          'customer_device_recognitions_id_tenantId_storeId_customerId_key',
          'customer_device_recognitions_tenantId_storeId_expiresAt_idx',
          'checkout_recognition_sessions_deviceRecognitionId_expiresAt_idx'
        ]) AS expected(name)
        LEFT JOIN (
          SELECT index_class.relname, index_config.indisready, index_config.indisvalid
          FROM pg_index index_config
          JOIN pg_class index_class ON index_class.oid = index_config.indexrelid
          JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
          WHERE index_namespace.nspname = 'public'
        ) actual ON actual.relname = expected.name
        WHERE actual.relname IS NULL OR NOT actual.indisready OR NOT actual.indisvalid
        ORDER BY expected.name
      `);
      const invalidConstraints = await client.query(`
        SELECT constraint_config.conname
        FROM pg_constraint constraint_config
        WHERE constraint_config.conrelid = ANY (
          ARRAY[
            'public.customers'::regclass,
            'public.customer_addresses'::regclass,
            'public.customer_address_store_uses'::regclass,
            'public.checkout_recognition_sessions'::regclass,
            'public.checkout_recognition_address_references'::regclass,
            'public.customer_recognition_throttles'::regclass,
            'public.storefront_devices'::regclass,
            'public.customer_device_recognitions'::regclass,
            'public.orders'::regclass
          ]
        )
          AND NOT constraint_config.convalidated
        ORDER BY constraint_config.conname
      `);
      const rls = await client.query(`
        SELECT table_config.relname
        FROM pg_class table_config
        JOIN pg_namespace table_namespace ON table_namespace.oid = table_config.relnamespace
        WHERE table_namespace.nspname = 'public'
          AND table_config.relname = ANY (ARRAY[
            'customer_address_store_uses',
            'checkout_recognition_sessions',
            'checkout_recognition_address_references',
            'customer_recognition_throttles',
            'storefront_devices',
            'customer_device_recognitions'
          ])
          AND NOT table_config.relrowsecurity
        ORDER BY table_config.relname
      `);
      const directGrants = await client.query(`
        SELECT table_name, grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = ANY (ARRAY[
            'customer_address_store_uses',
            'checkout_recognition_sessions',
            'checkout_recognition_address_references',
            'customer_recognition_throttles',
            'storefront_devices',
            'customer_device_recognitions'
          ])
          AND grantee IN ('anon', 'authenticated')
        ORDER BY table_name, grantee, privilege_type
      `);

      if (Number(customers.rows[0].invalid_phone_count) > 0) {
        failures.push('invalid_customer_phone');
      }
      if (duplicatePhones.rows[0].duplicate_group_count > 0) {
        failures.push('duplicate_normalized_customer_phone');
      }
      if (Number(addresses.rows[0].incomplete_count) > 0) {
        failures.push('incomplete_customer_address_backfill');
      }
      if (Number(addresses.rows[0].tenant_mismatch_count) > 0) {
        failures.push('customer_address_tenant_mismatch');
      }
      if (duplicateAddresses.rows[0].duplicate_group_count > 0) {
        failures.push('duplicate_customer_address');
      }
      if (multipleDefaults.rows[0].customer_count > 0) {
        failures.push('multiple_default_customer_addresses');
      }
      if (Number(orderTenantMismatches.rows[0].total) > 0) {
        failures.push('order_customer_tenant_mismatch');
      }
      if (Number(storeUseMismatches.rows[0].total) > 0) {
        failures.push('customer_address_store_use_scope_mismatch');
      }
      if (Number(devices.rows[0].invalid_count) > 0) failures.push('invalid_storefront_device');
      if (Number(deviceRecognitionMismatches.rows[0].total) > 0) {
        failures.push('customer_device_recognition_scope_mismatch');
      }
      if (Number(excessiveActiveDevices.rows[0].customer_store_count) > 0) {
        failures.push('customer_device_recognition_limit_exceeded');
      }
      if (Number(sessionDeviceMismatches.rows[0].total) > 0) {
        failures.push('recognition_session_device_scope_mismatch');
      }
      if (invalidIndexes.rows.length > 0) failures.push('recognition_index_invalid');
      if (invalidConstraints.rows.length > 0) failures.push('constraints_not_validated');
      if (rls.rows.length > 0) failures.push('recognition_rls_disabled');
      if (directGrants.rows.length > 0) failures.push('recognition_direct_grant_present');

      console.info(
        JSON.stringify({
          event: 'customer_recognition_preflight',
          phase: 'after_migrate',
          foundationApplied: true,
          customerCount: customers.rows[0].total,
          invalidCustomerPhoneCount: customers.rows[0].invalid_phone_count,
          duplicatePhoneGroupCount: duplicatePhones.rows[0].duplicate_group_count,
          customerAddressCount: addresses.rows[0].total,
          incompleteAddressCount: addresses.rows[0].incomplete_count,
          addressTenantMismatchCount: addresses.rows[0].tenant_mismatch_count,
          duplicateAddressGroupCount: duplicateAddresses.rows[0].duplicate_group_count,
          multipleDefaultAddressCustomerCount: multipleDefaults.rows[0].customer_count,
          orderCustomerTenantMismatchCount: orderTenantMismatches.rows[0].total,
          storeUseScopeMismatchCount: storeUseMismatches.rows[0].total,
          storefrontDeviceCount: devices.rows[0].total,
          invalidStorefrontDeviceCount: devices.rows[0].invalid_count,
          deviceRecognitionScopeMismatchCount: deviceRecognitionMismatches.rows[0].total,
          excessiveActiveDeviceCustomerStoreCount:
            excessiveActiveDevices.rows[0].customer_store_count,
          sessionDeviceScopeMismatchCount: sessionDeviceMismatches.rows[0].total,
          invalidIndexes: invalidIndexes.rows.map((row) => row.name),
          invalidConstraints: invalidConstraints.rows.map((row) => row.conname),
          tablesWithoutRls: rls.rows.map((row) => row.relname),
          directGrantCount: directGrants.rows.length,
          failures,
        }),
      );

      if (failures.length > 0) process.exitCode = 1;
    }

    await client.query('ROLLBACK');
  } catch (error) {
    console.error('[CUSTOMER_RECOGNITION_PREFLIGHT_FAILED]', {
      kind: error instanceof Error ? error.name : 'non_error',
    });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
