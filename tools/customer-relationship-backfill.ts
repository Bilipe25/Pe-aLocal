import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PREVIEW_SQL = `
  SELECT
    COUNT(DISTINCT identity.id)::text AS eligible_identities,
    COUNT(order_row.id)::text AS eligible_orders,
    COUNT(DISTINCT processed.id)::text AS already_processed_orders
  FROM public.orders order_row
  JOIN public.customers customer
    ON customer.id = order_row."customerId"
   AND customer."tenantId" = order_row."tenantId"
  JOIN public.consumer_identities identity
    ON identity.id = customer."consumerIdentityId"
  LEFT JOIN public.customer_relationship_processed_orders processed
    ON processed."orderId" = order_row.id
   AND processed."tenantId" = order_row."tenantId"
   AND processed."storeId" = order_row."storeId"
  WHERE order_row."tenantId" = $1
    AND order_row."storeId" = $2
    AND order_row.status = 'DELIVERED'::public."OrderStatus"
    AND order_row."paymentStatus" = 'PAID'::public."PaymentStatus"
    AND customer."consumerIdentityLinkProof" IS NOT NULL
    AND (identity."emailVerifiedAt" IS NOT NULL OR identity."phoneVerifiedAt" IS NOT NULL)
`;

const BACKFILL_BATCH_SQL = `
  WITH candidate_identities AS (
    SELECT identity.id AS identity_id, MIN(customer.id) AS customer_id
    FROM public.orders order_row
    JOIN public.customers customer
      ON customer.id = order_row."customerId"
     AND customer."tenantId" = order_row."tenantId"
    JOIN public.consumer_identities identity
      ON identity.id = customer."consumerIdentityId"
    LEFT JOIN public.customer_relationship_processed_orders processed
      ON processed."orderId" = order_row.id
     AND processed."tenantId" = order_row."tenantId"
     AND processed."storeId" = order_row."storeId"
    WHERE order_row."tenantId" = $1
      AND order_row."storeId" = $2
      AND order_row.status = 'DELIVERED'::public."OrderStatus"
      AND order_row."paymentStatus" = 'PAID'::public."PaymentStatus"
      AND customer."consumerIdentityLinkProof" IS NOT NULL
      AND (identity."emailVerifiedAt" IS NOT NULL OR identity."phoneVerifiedAt" IS NOT NULL)
      AND processed.id IS NULL
    GROUP BY identity.id
    ORDER BY identity.id
    LIMIT $3
  ), eligible_orders AS (
    SELECT
      order_row.id AS order_id,
      candidate.identity_id,
      candidate.customer_id,
      order_row.total AS order_value,
      COALESCE(order_row."deliveredAt", order_row."statusChangedAt", order_row."updatedAt") AS completed_at,
      LAG(COALESCE(order_row."deliveredAt", order_row."statusChangedAt", order_row."updatedAt")) OVER (
        PARTITION BY candidate.identity_id
        ORDER BY COALESCE(order_row."deliveredAt", order_row."statusChangedAt", order_row."updatedAt"), order_row.id
      ) AS previous_completed_at
    FROM candidate_identities candidate
    JOIN public.customers customer
      ON customer.id = candidate.customer_id
     AND customer."tenantId" = $1
    JOIN public.orders order_row
      ON order_row."customerId" = customer.id
     AND order_row."tenantId" = $1
     AND order_row."storeId" = $2
    WHERE order_row.status = 'DELIVERED'::public."OrderStatus"
      AND order_row."paymentStatus" = 'PAID'::public."PaymentStatus"
  ), aggregates AS (
    SELECT
      identity_id,
      MIN(customer_id) AS customer_id,
      MIN(completed_at) AS first_completed_at,
      MAX(completed_at) AS last_completed_at,
      COUNT(*)::integer AS completed_order_count,
      SUM(order_value)::integer AS total_completed_order_value,
      ROUND(AVG(order_value))::integer AS average_order_value,
      AVG(EXTRACT(EPOCH FROM (completed_at - previous_completed_at)) / 86400.0)
        FILTER (WHERE previous_completed_at IS NOT NULL) AS average_days_between_orders,
      COUNT(*) FILTER (WHERE completed_at >= CURRENT_TIMESTAMP - INTERVAL '30 days')::integer
        AS recent_order_frequency
    FROM eligible_orders
    GROUP BY identity_id
  ), classified AS (
    SELECT aggregates.*,
      CASE
        WHEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_completed_at)) / 86400) >=
          CASE
            WHEN completed_order_count >= 3 AND average_days_between_orders > 0
              THEN GREATEST(14, CEIL(average_days_between_orders * 2.5))
            ELSE 30
          END
          THEN 'INACTIVE'::public."CustomerRelationshipSegment"
        WHEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_completed_at)) / 86400) >=
          CASE
            WHEN completed_order_count >= 3 AND average_days_between_orders > 0
              THEN GREATEST(7, CEIL(average_days_between_orders * 1.5))
            ELSE 21
          END
          THEN 'COOLING'::public."CustomerRelationshipSegment"
        WHEN completed_order_count = 1 THEN 'NEW'::public."CustomerRelationshipSegment"
        WHEN completed_order_count = 2 THEN 'RETURNING'::public."CustomerRelationshipSegment"
        WHEN completed_order_count >= 5 AND average_days_between_orders <= 14
          THEN 'FREQUENT'::public."CustomerRelationshipSegment"
        ELSE 'RECURRING'::public."CustomerRelationshipSegment"
      END AS segment
    FROM aggregates
  ), upserted_snapshots AS (
    INSERT INTO public.customer_relationship_snapshots (
      id, "tenantId", "storeId", "consumerIdentityId", "customerId",
      "firstCompletedOrderAt", "lastCompletedOrderAt", "completedOrderCount",
      "totalCompletedOrderValue", "averageOrderValue", "averageDaysBetweenOrders",
      "recentOrderFrequency", segment, "segmentUpdatedAt", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text, $1, $2, identity_id, customer_id,
      first_completed_at, last_completed_at, completed_order_count,
      total_completed_order_value, average_order_value, average_days_between_orders,
      recent_order_frequency, segment, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM classified
    ON CONFLICT ("tenantId", "storeId", "consumerIdentityId") DO UPDATE SET
      "customerId" = EXCLUDED."customerId",
      "firstCompletedOrderAt" = EXCLUDED."firstCompletedOrderAt",
      "lastCompletedOrderAt" = EXCLUDED."lastCompletedOrderAt",
      "completedOrderCount" = EXCLUDED."completedOrderCount",
      "totalCompletedOrderValue" = EXCLUDED."totalCompletedOrderValue",
      "averageOrderValue" = EXCLUDED."averageOrderValue",
      "averageDaysBetweenOrders" = EXCLUDED."averageDaysBetweenOrders",
      "recentOrderFrequency" = EXCLUDED."recentOrderFrequency",
      segment = EXCLUDED.segment,
      "segmentUpdatedAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING id, "consumerIdentityId"
  ), inserted_processed_orders AS (
    INSERT INTO public.customer_relationship_processed_orders (
      id, "tenantId", "storeId", "snapshotId", "consumerIdentityId",
      "orderId", "completedAt", "orderValue", "createdAt"
    )
    SELECT
      gen_random_uuid()::text, $1, $2, snapshot.id, order_row.identity_id,
      order_row.order_id, order_row.completed_at, order_row.order_value, CURRENT_TIMESTAMP
    FROM eligible_orders order_row
    JOIN upserted_snapshots snapshot
      ON snapshot."consumerIdentityId" = order_row.identity_id
    ON CONFLICT ("orderId", "tenantId", "storeId") DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::integer FROM candidate_identities) AS identities,
    (SELECT COUNT(*)::integer FROM inserted_processed_orders) AS processed_orders
`;

function readRequiredUuid(argument: string | undefined, name: string) {
  const value = argument?.split('=', 2)[1];
  if (!value || !UUID_PATTERN.test(value)) throw new Error(`invalid_${name}`);
  return value;
}

function readBoundedInteger(argument: string | undefined, name: string, maximum: number) {
  const value = argument?.split('=', 2)[1];
  if (!value || !/^\d+$/.test(value)) throw new Error(`invalid_${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`invalid_${name}`);
  }
  return parsed;
}

export function parseCustomerRelationshipBackfillOptions(args: string[]) {
  const tenantArgument = args.find((argument) => argument.startsWith('--tenant='));
  const storeArgument = args.find((argument) => argument.startsWith('--store='));
  const batchArgument = args.find((argument) => argument.startsWith('--batch-size='));
  const maxBatchesArgument = args.find((argument) => argument.startsWith('--max-batches='));
  const allowed = new Set([
    '--apply',
    tenantArgument,
    storeArgument,
    batchArgument,
    maxBatchesArgument,
  ]);
  const unknown = args.find((argument) => argument !== '--' && !allowed.has(argument));
  if (unknown) throw new Error('unknown_argument');

  return {
    apply: args.includes('--apply'),
    tenantId: readRequiredUuid(tenantArgument, 'tenant'),
    storeId: readRequiredUuid(storeArgument, 'store'),
    batchSize: batchArgument
      ? readBoundedInteger(batchArgument, 'batch_size', 2_000)
      : DEFAULT_BATCH_SIZE,
    maxBatches: maxBatchesArgument
      ? readBoundedInteger(maxBatchesArgument, 'max_batches', 100)
      : DEFAULT_MAX_BATCHES,
  };
}

async function runBatch(
  client: Client,
  options: ReturnType<typeof parseCustomerRelationshipBackfillOptions>,
) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `relationship-backfill:${options.storeId}`,
    ]);
    const guard = await client.query(
      `SELECT entitlement."customerRelationshipEnabled"
       FROM public.stores store
       JOIN public.store_entitlements entitlement
         ON entitlement."storeId" = store.id AND entitlement."tenantId" = store."tenantId"
       WHERE store.id = $1 AND store."tenantId" = $2`,
      [options.storeId, options.tenantId],
    );
    if (guard.rowCount !== 1) throw new Error('store_or_entitlement_not_found');
    if (guard.rows[0]?.customerRelationshipEnabled === true) {
      throw new Error('relationship_must_be_disabled_during_backfill');
    }
    const result = await client.query(BACKFILL_BATCH_SQL, [
      options.tenantId,
      options.storeId,
      options.batchSize,
    ]);
    await client.query('COMMIT');
    return {
      identities: Number(result.rows[0]?.identities ?? 0),
      processedOrders: Number(result.rows[0]?.processed_orders ?? 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function runCustomerRelationshipBackfill(
  client: Client,
  options: ReturnType<typeof parseCustomerRelationshipBackfillOptions>,
) {
  const preview = await client.query(PREVIEW_SQL, [options.tenantId, options.storeId]);
  const counts = {
    eligibleIdentities: Number(preview.rows[0]?.eligible_identities ?? 0),
    eligibleOrders: Number(preview.rows[0]?.eligible_orders ?? 0),
    alreadyProcessedOrders: Number(preview.rows[0]?.already_processed_orders ?? 0),
  };
  if (!options.apply) return { status: 'dry_run' as const, ...counts };

  let identities = 0;
  let processedOrders = 0;
  let batches = 0;
  let exhausted = false;
  while (batches < options.maxBatches) {
    const result = await runBatch(client, options);
    identities += result.identities;
    processedOrders += result.processedOrders;
    batches += 1;
    if (result.identities < options.batchSize) {
      exhausted = true;
      break;
    }
  }
  return {
    status: 'applied' as const,
    ...counts,
    identities,
    processedOrders,
    batches,
    batchLimitReached: !exhausted,
  };
}

async function main() {
  loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });
  let options: ReturnType<typeof parseCustomerRelationshipBackfillOptions>;
  try {
    options = parseCustomerRelationshipBackfillOptions(process.argv.slice(2));
  } catch (error) {
    console.error('[CUSTOMER_RELATIONSHIP_BACKFILL_FAILED]', {
      kind: error instanceof Error ? error.message : 'invalid_options',
    });
    process.exitCode = 1;
    return;
  }
  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error('[CUSTOMER_RELATIONSHIP_BACKFILL_FAILED]', { kind: 'missing_direct_url' });
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await runCustomerRelationshipBackfill(client, options);
    console.info('[CUSTOMER_RELATIONSHIP_BACKFILL]', result);
  } catch (error) {
    console.error('[CUSTOMER_RELATIONSHIP_BACKFILL_FAILED]', {
      kind: error instanceof Error ? error.message : 'database_operation_failed',
    });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) await main();
