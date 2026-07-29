import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 20;
const DEFAULT_GRACE_MINUTES = 60;
const CLEANUP_LOCK_NAME = 'pedidolocal:customer-recognition-cleanup';

const DELETE_EXPIRED_REFERENCES_SQL = `
  WITH candidates AS (
    SELECT reference.id
    FROM public.checkout_recognition_address_references reference
    WHERE reference."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    ORDER BY reference."expiresAt", reference.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.checkout_recognition_address_references reference
    USING candidates
    WHERE reference.id = candidates.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer AS deleted_count
  FROM deleted
`;

const DELETE_EXPIRED_SESSIONS_SQL = `
  WITH candidates AS (
    SELECT session.id
    FROM public.checkout_recognition_sessions session
    WHERE session."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    ORDER BY session."expiresAt", session.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  ), reference_count AS (
    SELECT COUNT(*)::integer AS count
    FROM public.checkout_recognition_address_references reference
    JOIN candidates ON candidates.id = reference."recognitionSessionId"
  ), deleted AS (
    DELETE FROM public.checkout_recognition_sessions session
    USING candidates
    WHERE session.id = candidates.id
    RETURNING 1
  )
  SELECT
    COUNT(*)::integer AS deleted_count,
    (SELECT count FROM reference_count) AS cascaded_reference_count
  FROM deleted
`;

const DELETE_EXPIRED_THROTTLES_SQL = `
  WITH candidates AS (
    SELECT throttle.id
    FROM public.customer_recognition_throttles throttle
    WHERE throttle."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    ORDER BY throttle."expiresAt", throttle.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.customer_recognition_throttles throttle
    USING candidates
    WHERE throttle.id = candidates.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer AS deleted_count
  FROM deleted
`;

const DELETE_EXPIRED_DEVICE_RECOGNITIONS_SQL = `
  WITH candidates AS (
    SELECT recognition.id
    FROM public.customer_device_recognitions recognition
    WHERE recognition."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
       OR (
         recognition."revokedAt" IS NOT NULL
         AND recognition."revokedAt" <= clock_timestamp() - make_interval(mins => $1::integer)
       )
    ORDER BY COALESCE(recognition."revokedAt", recognition."expiresAt"), recognition.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.customer_device_recognitions recognition
    USING candidates
    WHERE recognition.id = candidates.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer AS deleted_count
  FROM deleted
`;

const DELETE_EXPIRED_DEVICES_SQL = `
  WITH candidates AS (
    SELECT device.id
    FROM public.storefront_devices device
    WHERE device."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_device_recognitions recognition
        WHERE recognition."storefrontDeviceId" = device.id
      )
    ORDER BY device."expiresAt", device.id
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  ), deleted AS (
    DELETE FROM public.storefront_devices device
    USING candidates
    WHERE device.id = candidates.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer AS deleted_count
  FROM deleted
`;

const COUNT_ELIGIBLE_ROWS_SQL = `
  SELECT
    (
      SELECT COUNT(*)::bigint
      FROM public.checkout_recognition_address_references reference
      WHERE reference."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    )::text AS expired_references,
    (
      SELECT COUNT(*)::bigint
      FROM public.checkout_recognition_sessions session
      WHERE session."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    )::text AS expired_sessions,
    (
      SELECT COUNT(*)::bigint
      FROM public.customer_recognition_throttles throttle
      WHERE throttle."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
    )::text AS expired_throttles,
    (
      SELECT COUNT(*)::bigint
      FROM public.customer_device_recognitions recognition
      WHERE recognition."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
         OR (
           recognition."revokedAt" IS NOT NULL
           AND recognition."revokedAt" <= clock_timestamp() - make_interval(mins => $1::integer)
         )
    )::text AS expired_device_recognitions,
    (
      SELECT COUNT(*)::bigint
      FROM public.storefront_devices device
      WHERE device."expiresAt" <= clock_timestamp() - make_interval(mins => $1::integer)
        AND NOT EXISTS (
          SELECT 1
          FROM public.customer_device_recognitions recognition
          WHERE recognition."storefrontDeviceId" = device.id
        )
    )::text AS expired_devices
`;

function parseBoundedInteger(flag, value, minimum, maximum) {
  if (!/^\d+$/.test(value ?? '')) {
    throw new Error(`invalid_${flag}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`invalid_${flag}`);
  }

  return parsed;
}

export function parseCleanupOptions(args) {
  const options = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    maxBatches: DEFAULT_MAX_BATCHES,
    graceMinutes: DEFAULT_GRACE_MINUTES,
  };

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }

    if (argument === '--apply') {
      options.apply = true;
      continue;
    }

    const [flag, value] = argument.split('=', 2);
    if (flag === '--batch-size') {
      options.batchSize = parseBoundedInteger('batch_size', value, 10, 5_000);
    } else if (flag === '--max-batches') {
      options.maxBatches = parseBoundedInteger('max_batches', value, 1, 1_000);
    } else if (flag === '--grace-minutes') {
      options.graceMinutes = parseBoundedInteger('grace_minutes', value, 15, 10_080);
    } else {
      throw new Error('unknown_argument');
    }
  }

  return options;
}

async function withShortTransaction(client, operation) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await operation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function deleteInBatches(client, sql, options) {
  let deleted = 0;
  let cascadedReferences = 0;
  let batches = 0;
  let exhausted = false;

  while (batches < options.maxBatches) {
    const result = await withShortTransaction(client, () =>
      client.query(sql, [options.graceMinutes, options.batchSize]),
    );
    const batchDeleted = Number(result.rows[0]?.deleted_count ?? 0);
    const batchCascaded = Number(result.rows[0]?.cascaded_reference_count ?? 0);

    deleted += batchDeleted;
    cascadedReferences += batchCascaded;
    batches += 1;

    if (batchDeleted < options.batchSize) {
      exhausted = true;
      break;
    }
  }

  return { deleted, cascadedReferences, batches, batchLimitReached: !exhausted };
}

async function countEligibleRows(client, graceMinutes) {
  await client.query('BEGIN TRANSACTION READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(COUNT_ELIGIBLE_ROWS_SQL, [graceMinutes]);
    await client.query('ROLLBACK');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runCustomerRecognitionCleanup({ client, options }) {
  const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [
    CLEANUP_LOCK_NAME,
  ]);

  if (!lock.rows[0]?.acquired) {
    return { status: 'skipped', reason: 'already_running' };
  }

  try {
    if (!options.apply) {
      const eligible = await countEligibleRows(client, options.graceMinutes);
      return {
        status: 'dry_run',
        graceMinutes: options.graceMinutes,
        eligible: {
          references: eligible.expired_references,
          sessions: eligible.expired_sessions,
          throttles: eligible.expired_throttles,
          deviceRecognitions: eligible.expired_device_recognitions,
          devices: eligible.expired_devices,
        },
      };
    }

    const references = await deleteInBatches(client, DELETE_EXPIRED_REFERENCES_SQL, options);
    const sessions = await deleteInBatches(client, DELETE_EXPIRED_SESSIONS_SQL, options);
    const throttles = await deleteInBatches(client, DELETE_EXPIRED_THROTTLES_SQL, options);
    const deviceRecognitions = await deleteInBatches(
      client,
      DELETE_EXPIRED_DEVICE_RECOGNITIONS_SQL,
      options,
    );
    const devices = await deleteInBatches(client, DELETE_EXPIRED_DEVICES_SQL, options);

    return {
      status: 'applied',
      graceMinutes: options.graceMinutes,
      batchSize: options.batchSize,
      maxBatches: options.maxBatches,
      deleted: {
        // Includes references removed directly and those removed by the session FK cascade.
        references: references.deleted + sessions.cascadedReferences,
        sessions: sessions.deleted,
        throttles: throttles.deleted,
        deviceRecognitions: deviceRecognitions.deleted,
        devices: devices.deleted,
      },
      batches: {
        references: references.batches,
        sessions: sessions.batches,
        throttles: throttles.batches,
        deviceRecognitions: deviceRecognitions.batches,
        devices: devices.batches,
      },
      batchLimitReached:
        references.batchLimitReached ||
        sessions.batchLimitReached ||
        throttles.batchLimitReached ||
        deviceRecognitions.batchLimitReached ||
        devices.batchLimitReached,
    };
  } finally {
    // Encerrar a conexão também libera o lock; uma falha de unlock não deve
    // esconder o resultado (ou a falha) da limpeza já concluída.
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', [CLEANUP_LOCK_NAME])
      .catch(() => undefined);
  }
}

async function main() {
  loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

  let options;
  try {
    options = parseCleanupOptions(process.argv.slice(2));
  } catch (error) {
    console.error('[CUSTOMER_RECOGNITION_CLEANUP_FAILED]', {
      kind: error instanceof Error ? error.message : 'invalid_options',
    });
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error('[CUSTOMER_RECOGNITION_CLEANUP_FAILED]', {
      kind: 'missing_direct_url',
    });
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString,
    application_name: 'pedidolocal-recognition-cleanup',
  });

  try {
    await client.connect();
    const result = await runCustomerRecognitionCleanup({ client, options });
    console.info('[CUSTOMER_RECOGNITION_CLEANUP]', result);
  } catch (error) {
    console.error('[CUSTOMER_RECOGNITION_CLEANUP_FAILED]', {
      kind: 'database_operation_failed',
      databaseCode:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined,
    });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  await main();
}
