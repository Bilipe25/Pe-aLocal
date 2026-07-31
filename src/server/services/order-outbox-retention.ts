import { Prisma, type PrismaClient } from '@prisma/client';

export const ORDER_OUTBOX_DEFAULT_RETENTION_DAYS = 30;
export const ORDER_OUTBOX_DEFAULT_RETENTION_BATCH_SIZE = 500;

const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 3650;
const MIN_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 5000;

type OutboxRetentionClient = Pick<PrismaClient, '$queryRaw'>;

export interface OrderOutboxRetentionOptions {
  retentionDays?: number;
  batchSize?: number;
  now?: Date;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

export function resolveOrderOutboxRetentionOptions(options: OrderOutboxRetentionOptions = {}) {
  const retentionDays = boundedInteger(
    options.retentionDays ?? ORDER_OUTBOX_DEFAULT_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
    'retentionDays',
  );
  const batchSize = boundedInteger(
    options.batchSize ?? ORDER_OUTBOX_DEFAULT_RETENTION_BATCH_SIZE,
    MIN_BATCH_SIZE,
    MAX_BATCH_SIZE,
    'batchSize',
  );
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Invalid retention clock.');

  return {
    retentionDays,
    batchSize,
    cutoff: new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000),
  };
}

export async function countRetainedOrderOutboxEvents(
  db: OutboxRetentionClient,
  options: OrderOutboxRetentionOptions = {},
) {
  const resolved = resolveOrderOutboxRetentionOptions(options);
  const [result] = await db.$queryRaw<Array<{ eligible: number }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS eligible
    FROM order_outbox_events
    WHERE status = 'PROCESSED'
      AND "processedAt" IS NOT NULL
      AND "processedAt" < ${resolved.cutoff}
  `);

  return { eligible: result?.eligible ?? 0, ...resolved };
}

/**
 * Removes one small, lock-safe batch. Failed/pending events and recent processed
 * events are deliberately outside the deletion predicate.
 */
export async function purgeProcessedOrderOutboxEvents(
  db: OutboxRetentionClient,
  options: OrderOutboxRetentionOptions = {},
) {
  const resolved = resolveOrderOutboxRetentionOptions(options);
  const [result] = await db.$queryRaw<Array<{ deleted: number }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM order_outbox_events
      WHERE status = 'PROCESSED'
        AND "processedAt" IS NOT NULL
        AND "processedAt" < ${resolved.cutoff}
      ORDER BY "processedAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${resolved.batchSize}
    ), deleted AS (
      DELETE FROM order_outbox_events AS event
      USING candidates
      WHERE event.id = candidates.id
        AND event.status = 'PROCESSED'
        AND event."processedAt" < ${resolved.cutoff}
      RETURNING event.id
    )
    SELECT COUNT(*)::integer AS deleted
    FROM deleted
  `);

  return { deleted: result?.deleted ?? 0, ...resolved };
}
