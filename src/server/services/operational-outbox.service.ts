import { Prisma, type OperationalOutboxEventType, type PrismaClient } from '@prisma/client';

import {
  OPERATIONAL_EVENT_SCHEMA_VERSION,
  diningRoomOperationalPayloadSchema,
  operationalOutboxQueueMessageSchema,
  type OperationalOutboxQueueMessage,
} from '@/domain/operational-events';
import type { OperationalEventPublisher } from '@/lib/pusher/order-event-publisher';
import {
  OUTBOX_MAX_ATTEMPTS,
  type OutboxProcessingResult,
} from '@/server/services/order-outbox-processor';
import {
  resolveOrderOutboxRetentionOptions,
  type OrderOutboxRetentionOptions,
} from '@/server/services/order-outbox-retention';

const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;
const STALE_QUEUE_MS = 15 * 60 * 1_000;
const RELAY_BATCH_SIZE = 100;

type DiningRoomEventInput = {
  tenantId: string;
  storeId: string;
  sessionId: string;
  tableId: string;
  eventType: OperationalOutboxEventType;
  reason: 'REQUEST_OPENED' | 'REQUEST_RESOLVED' | 'TRANSFERRED' | 'CLOSED';
  version: number;
  occurredAt?: Date;
};

export async function createDiningRoomOperationalEvent(
  tx: Prisma.TransactionClient,
  input: DiningRoomEventInput,
) {
  const occurredAt = input.occurredAt ?? new Date();
  return tx.operationalOutboxEvent.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      aggregateType: 'DINING_SESSION',
      aggregateId: input.sessionId,
      eventType: input.eventType,
      aggregateVersion: input.version,
      schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
      occurredAt,
      payload: {
        tableId: input.tableId,
        sessionId: input.sessionId,
        reason: input.reason,
        version: input.version,
        occurredAt: occurredAt.toISOString(),
      },
    },
    select: { id: true },
  });
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown';
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 1_000);
}

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

export async function processOperationalOutboxMessage(
  db: PrismaClient,
  publisher: OperationalEventPublisher,
  rawMessage: unknown,
  queueAttempt: number,
  queueMessageId: string,
): Promise<OutboxProcessingResult> {
  const parsed = operationalOutboxQueueMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    console.error('[OPERATIONAL_OUTBOX_INVALID_MESSAGE]', { queueMessageId, queueAttempt });
    return { action: 'retry', delaySeconds: retryDelaySeconds(queueAttempt) };
  }

  const current = await db.operationalOutboxEvent.findUnique({
    where: { id: parsed.data.eventId },
  });
  if (!current || current.status === 'PROCESSED')
    return { action: 'ack', eventId: parsed.data.eventId };
  if (current.status === 'FAILED') return { action: 'dead-letter', eventId: current.id };

  const now = new Date();
  const staleLock = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  if (
    current.attempts >= OUTBOX_MAX_ATTEMPTS &&
    (!current.lockedAt || current.lockedAt < staleLock)
  ) {
    const failed = await db.operationalOutboxEvent.updateMany({
      where: {
        id: current.id,
        status: { in: ['PENDING', 'PROCESSING'] },
        attempts: { gte: OUTBOX_MAX_ATTEMPTS },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }],
      },
      data: { status: 'FAILED', failedAt: now, lockedAt: null, lockToken: null },
    });
    if (failed.count === 1) return { action: 'dead-letter', eventId: current.id };
  }
  if (current.availableAt > now) {
    return {
      action: 'retry',
      eventId: current.id,
      delaySeconds: Math.max(1, Math.ceil((current.availableAt.getTime() - now.getTime()) / 1_000)),
    };
  }
  const lockToken = crypto.randomUUID();
  const [claimed] = await db.operationalOutboxEvent.updateManyAndReturn({
    where: {
      id: current.id,
      status: { in: ['PENDING', 'PROCESSING'] },
      attempts: { lt: OUTBOX_MAX_ATTEMPTS },
      availableAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } }],
    },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      lockedAt: now,
      lockToken,
    },
    select: { attempts: true },
  });
  if (!claimed) return { action: 'retry', delaySeconds: 5, eventId: current.id };

  try {
    if (current.schemaVersion !== OPERATIONAL_EVENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported operational event schema version ${current.schemaVersion}.`);
    }
    const payload = diningRoomOperationalPayloadSchema.parse(current.payload);
    if (payload.sessionId !== current.aggregateId || payload.version !== current.aggregateVersion) {
      throw new Error('Operational event payload does not match its outbox aggregate.');
    }
    await publisher.publish({
      id: current.id,
      storeId: current.storeId,
      eventType: current.eventType,
      schemaVersion: current.schemaVersion,
      payload: current.payload,
    });
    const processed = await db.operationalOutboxEvent.updateMany({
      where: { id: current.id, status: 'PROCESSING', lockToken },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: null,
      },
    });
    if (processed.count !== 1) throw new Error('Operational outbox claim lost after publication.');
    return { action: 'ack', eventId: current.id };
  } catch (error) {
    const exhausted = claimed.attempts >= OUTBOX_MAX_ATTEMPTS;
    const delaySeconds = retryDelaySeconds(claimed.attempts);
    await db.operationalOutboxEvent.updateMany({
      where: { id: current.id, status: 'PROCESSING', lockToken },
      data: {
        status: exhausted ? 'FAILED' : 'PROCESSING',
        failedAt: exhausted ? new Date() : null,
        availableAt: new Date(Date.now() + delaySeconds * 1_000),
        lockedAt: null,
        lockToken: null,
        lastError: safeError(error),
      },
    });
    return exhausted
      ? { action: 'dead-letter', eventId: current.id }
      : { action: 'retry', delaySeconds, eventId: current.id };
  }
}

export async function relayPendingOperationalOutboxEvents(
  db: PrismaClient,
  queue: Queue<OperationalOutboxQueueMessage>,
) {
  const lockToken = crypto.randomUUID();
  const staleQueuedAt = new Date(Date.now() - STALE_QUEUE_MS);
  const staleLockedAt = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id FROM operational_outbox_events
      WHERE "availableAt" <= NOW()
        AND attempts < ${OUTBOX_MAX_ATTEMPTS}
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockedAt})
        AND (status = 'PENDING' OR (status = 'PROCESSING' AND ("queuedAt" IS NULL OR "queuedAt" < ${staleQueuedAt})))
      ORDER BY "availableAt", "createdAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT ${RELAY_BATCH_SIZE}
    )
    UPDATE operational_outbox_events AS event
    SET status = 'PROCESSING', "lockedAt" = NOW(), "lockToken" = ${lockToken}::uuid, "updatedAt" = NOW()
    FROM candidates WHERE event.id = candidates.id RETURNING event.id
  `);
  if (!claimed.length) return { claimed: 0, enqueued: 0 };

  try {
    await queue.sendBatch(
      claimed.map(({ id }) => ({
        body: {
          eventId: id,
          schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
          stream: 'OPERATIONAL',
        },
        contentType: 'json' as const,
      })),
    );
    await db.operationalOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: { queuedAt: new Date(), lockedAt: null, lockToken: null, lastError: null },
    });
    return { claimed: claimed.length, enqueued: claimed.length };
  } catch (error) {
    await db.operationalOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: {
        status: 'PENDING',
        availableAt: new Date(Date.now() + 60_000),
        lockedAt: null,
        lockToken: null,
        lastError: safeError(error),
      },
    });
    throw error;
  }
}

export async function purgeProcessedOperationalOutboxEvents(
  db: Pick<PrismaClient, '$queryRaw'>,
  options: OrderOutboxRetentionOptions = {},
) {
  const resolved = resolveOrderOutboxRetentionOptions(options);
  const [result] = await db.$queryRaw<Array<{ deleted: number }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id FROM operational_outbox_events
      WHERE status = 'PROCESSED'
        AND "processedAt" IS NOT NULL
        AND "processedAt" < ${resolved.cutoff}
      ORDER BY "processedAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT ${resolved.batchSize}
    ), deleted AS (
      DELETE FROM operational_outbox_events AS event
      USING candidates
      WHERE event.id = candidates.id
        AND event.status = 'PROCESSED'
        AND event."processedAt" < ${resolved.cutoff}
      RETURNING event.id
    )
    SELECT COUNT(*)::integer AS deleted FROM deleted
  `);
  return { deleted: result?.deleted ?? 0, ...resolved };
}
