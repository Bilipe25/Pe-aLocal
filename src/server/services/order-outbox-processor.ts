import { Prisma, type PrismaClient } from '@prisma/client';

import {
  ORDER_EVENT_SCHEMA_VERSION,
  orderEventPayloadSchema,
  orderOutboxQueueMessageSchema,
  type OrderOutboxQueueMessage,
} from '@/domain/orders/order-events';
import type { OrderEventPublisher } from '@/lib/pusher/order-event-publisher';

export const OUTBOX_MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1_000;
const STALE_QUEUE_MS = 15 * 60 * 1_000;
const RELAY_BATCH_SIZE = 100;

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'unknown';
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 1_000);
}

function retryDelaySeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

export type OutboxProcessingResult =
  | { action: 'ack'; eventId?: string }
  | { action: 'dead-letter'; eventId: string }
  | { action: 'retry'; delaySeconds: number; eventId?: string };

export async function processOrderOutboxMessage(
  db: PrismaClient,
  publisher: OrderEventPublisher,
  rawMessage: unknown,
  queueAttempt: number,
  queueMessageId: string,
): Promise<OutboxProcessingResult> {
  const parsed = orderOutboxQueueMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    console.error('[ORDER_OUTBOX_INVALID_MESSAGE]', { queueMessageId, queueAttempt });
    return { action: 'retry', delaySeconds: retryDelaySeconds(queueAttempt) };
  }

  const message: OrderOutboxQueueMessage = parsed.data;
  const current = await db.orderOutboxEvent.findUnique({ where: { id: message.eventId } });
  if (!current || current.status === 'PROCESSED') {
    return { action: 'ack', eventId: message.eventId };
  }
  if (current.status === 'FAILED') {
    return { action: 'dead-letter', eventId: message.eventId };
  }

  const lockToken = crypto.randomUUID();
  const now = new Date();
  if (current.availableAt > now) {
    return {
      action: 'retry',
      delaySeconds: Math.max(1, Math.ceil((current.availableAt.getTime() - now.getTime()) / 1_000)),
      eventId: current.id,
    };
  }
  const [claimed] = await db.orderOutboxEvent.updateManyAndReturn({
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
  if (!claimed) {
    const latest = await db.orderOutboxEvent.findUnique({
      where: { id: current.id },
      select: { status: true, attempts: true, lockedAt: true },
    });
    if (!latest || latest.status === 'PROCESSED') {
      return { action: 'ack', eventId: current.id };
    }
    if (latest.status === 'FAILED') {
      return { action: 'dead-letter', eventId: current.id };
    }
    const staleLock = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    if (
      latest.attempts >= OUTBOX_MAX_ATTEMPTS &&
      (!latest.lockedAt || latest.lockedAt < staleLock)
    ) {
      const failed = await db.orderOutboxEvent.updateMany({
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
    return { action: 'retry', delaySeconds: 5, eventId: current.id };
  }

  try {
    if (current.schemaVersion !== ORDER_EVENT_SCHEMA_VERSION) {
      throw new Error(`Unsupported order event schema version ${current.schemaVersion}.`);
    }
    const payload = orderEventPayloadSchema.parse(current.payload);
    if (payload.orderId !== current.orderId || payload.version !== current.aggregateVersion) {
      throw new Error('Order event payload does not match its outbox aggregate.');
    }
    await publisher.publish({
      id: current.id,
      storeId: current.storeId,
      eventType: current.eventType,
      schemaVersion: current.schemaVersion,
      payload: current.payload,
    });
    const processed = await db.orderOutboxEvent.updateMany({
      where: { id: current.id, status: 'PROCESSING', lockToken },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lockToken: null,
        lastError: null,
      },
    });
    if (processed.count !== 1) throw new Error('Outbox claim lost after publication.');
    console.info('[ORDER_OUTBOX_PROCESSED]', {
      eventId: current.id,
      eventType: current.eventType,
      attempts: claimed.attempts,
    });
    return { action: 'ack', eventId: current.id };
  } catch (error) {
    const exhausted = claimed.attempts >= OUTBOX_MAX_ATTEMPTS;
    const delaySeconds = retryDelaySeconds(claimed.attempts);
    const persisted = await db.orderOutboxEvent.updateMany({
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
    if (persisted.count !== 1) {
      const latest = await db.orderOutboxEvent.findUnique({
        where: { id: current.id },
        select: { status: true },
      });
      if (!latest || latest.status === 'PROCESSED') {
        return { action: 'ack', eventId: current.id };
      }
      if (latest.status === 'FAILED') {
        return { action: 'dead-letter', eventId: current.id };
      }
      return { action: 'retry', delaySeconds: 5, eventId: current.id };
    }
    console.error(exhausted ? '[ORDER_OUTBOX_DEAD_LETTER]' : '[ORDER_OUTBOX_RETRY]', {
      eventId: current.id,
      eventType: current.eventType,
      queueAttempt,
      delaySeconds,
      error: safeError(error),
    });
    return exhausted
      ? { action: 'dead-letter', eventId: current.id }
      : { action: 'retry', delaySeconds, eventId: current.id };
  }
}

export async function relayPendingOrderOutboxEvents(
  db: PrismaClient,
  queue: Queue<OrderOutboxQueueMessage>,
  deadLetterQueue: Queue<OrderOutboxQueueMessage>,
) {
  let deadLettered = 0;
  try {
    deadLettered = await deadLetterExhaustedOrderOutboxEvents(db, deadLetterQueue);
  } catch (error) {
    console.error('[ORDER_OUTBOX_DEAD_LETTER_RELAY_FAILED]', { error: safeError(error) });
  }
  const lockToken = crypto.randomUUID();
  const staleQueuedAt = new Date(Date.now() - STALE_QUEUE_MS);
  const staleLockedAt = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM order_outbox_events
      WHERE "availableAt" <= NOW()
        AND attempts < ${OUTBOX_MAX_ATTEMPTS}
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockedAt})
        AND (
          status = 'PENDING'
          OR (
            status = 'PROCESSING'
            AND ("queuedAt" IS NULL OR "queuedAt" < ${staleQueuedAt})
          )
        )
      ORDER BY "availableAt" ASC, "createdAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${RELAY_BATCH_SIZE}
    )
    UPDATE order_outbox_events AS event
    SET status = 'PROCESSING',
        "lockedAt" = NOW(),
        "lockToken" = ${lockToken}::uuid,
        "updatedAt" = NOW()
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id
  `);
  if (!claimed.length) return { claimed: 0, enqueued: 0, deadLettered };

  try {
    await queue.sendBatch(
      claimed.map(({ id }) => ({
        body: { eventId: id, schemaVersion: 1 },
        contentType: 'json' as const,
      })),
    );
    const queuedAt = new Date();
    await db.orderOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: { queuedAt, lockedAt: null, lockToken: null, lastError: null },
    });
    console.info('[ORDER_OUTBOX_RELAYED]', { count: claimed.length });
    return { claimed: claimed.length, enqueued: claimed.length, deadLettered };
  } catch (error) {
    await db.orderOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: {
        status: 'PENDING',
        availableAt: new Date(Date.now() + 60_000),
        lockedAt: null,
        lockToken: null,
        lastError: safeError(error),
      },
    });
    console.error('[ORDER_OUTBOX_RELAY_FAILED]', {
      count: claimed.length,
      error: safeError(error),
    });
    throw error;
  }
}

async function deadLetterExhaustedOrderOutboxEvents(
  db: PrismaClient,
  deadLetterQueue: Queue<OrderOutboxQueueMessage>,
) {
  const lockToken = crypto.randomUUID();
  const staleLockedAt = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM order_outbox_events
      WHERE attempts >= ${OUTBOX_MAX_ATTEMPTS}
        AND status IN ('PENDING', 'PROCESSING')
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockedAt})
      ORDER BY "availableAt" ASC, "createdAt" ASC, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${RELAY_BATCH_SIZE}
    )
    UPDATE order_outbox_events AS event
    SET "lockedAt" = NOW(),
        "lockToken" = ${lockToken}::uuid,
        "updatedAt" = NOW()
    FROM candidates
    WHERE event.id = candidates.id
    RETURNING event.id
  `);
  if (!claimed.length) return 0;

  try {
    await deadLetterQueue.sendBatch(
      claimed.map(({ id }) => ({
        body: { eventId: id, schemaVersion: ORDER_EVENT_SCHEMA_VERSION },
        contentType: 'json' as const,
      })),
    );
    const failedAt = new Date();
    await db.orderOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: {
        status: 'FAILED',
        failedAt,
        lockedAt: null,
        lockToken: null,
      },
    });
    console.error('[ORDER_OUTBOX_DEAD_LETTER_RELAYED]', { count: claimed.length });
    return claimed.length;
  } catch (error) {
    await db.orderOutboxEvent.updateMany({
      where: { id: { in: claimed.map(({ id }) => id) }, lockToken },
      data: {
        availableAt: new Date(Date.now() + 60_000),
        lockedAt: null,
        lockToken: null,
        lastError: safeError(error),
      },
    });
    throw error;
  }
}
