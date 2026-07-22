import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  ORDER_EVENT_SCHEMA_VERSION,
  type OrderOutboxQueueMessage,
} from '@/domain/orders/order-events';
import { getDb } from '@/server/database/client';

export type OrderEventPublishMode = 'direct' | 'dual' | 'outbox';

export function getOrderEventPublishMode(): OrderEventPublishMode {
  const mode = process.env.ORDER_EVENT_PUBLISH_MODE as string | undefined;
  return mode === 'dual' || mode === 'outbox' ? mode : 'direct';
}

function getOutboxQueue(): Queue<OrderOutboxQueueMessage> | null {
  try {
    const { env } = getCloudflareContext();
    return (
      (
        env as CloudflareEnv & {
          ORDER_OUTBOX_QUEUE?: Queue<OrderOutboxQueueMessage>;
        }
      ).ORDER_OUTBOX_QUEUE ?? null
    );
  } catch {
    return null;
  }
}

async function enqueueEvents(eventIds: string[]): Promise<boolean> {
  if (!eventIds.length) return true;
  const queue = getOutboxQueue();
  if (!queue) {
    console.warn('[ORDER_OUTBOX_QUEUE_UNAVAILABLE]', { eventIds });
    return false;
  }

  try {
    await queue.sendBatch(
      eventIds.map((eventId) => ({
        body: { eventId, schemaVersion: ORDER_EVENT_SCHEMA_VERSION },
        contentType: 'json' as const,
      })),
    );
    const queuedAt = new Date();
    await getDb().orderOutboxEvent.updateMany({
      where: { id: { in: eventIds }, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        queuedAt,
        availableAt: queuedAt,
        lastError: null,
      },
    });
    return true;
  } catch (error) {
    console.error('[ORDER_OUTBOX_ENQUEUE_FAILED]', {
      eventIds,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

async function markDirectlyProcessed(eventIds: string[]) {
  if (!eventIds.length) return;
  try {
    await getDb().orderOutboxEvent.updateMany({
      where: { id: { in: eventIds }, status: 'PENDING' },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    // A publicação já ocorreu. Manter pendente permite replay seguro, ainda que duplicado.
    console.error('[ORDER_OUTBOX_DIRECT_MARK_FAILED]', {
      eventIds,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function attemptDirectPublish(publish: () => Promise<void>) {
  try {
    await publish();
    return true;
  } catch (error) {
    console.error('[ORDER_EVENT_DIRECT_PUBLISH_FAILED]', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

function deferEnqueue(eventIds: string[]) {
  try {
    const { ctx } = getCloudflareContext();
    ctx.waitUntil(enqueueEvents(eventIds));
    return true;
  } catch {
    return false;
  }
}

export async function dispatchCommittedOrderEvents(input: {
  eventIds: string[];
  publishDirect: () => Promise<void>;
}) {
  if (!input.eventIds.length) return { notificationPending: false };
  const mode = getOrderEventPublishMode();

  if (mode === 'direct') {
    const published = await attemptDirectPublish(input.publishDirect);
    if (published) await markDirectlyProcessed(input.eventIds);
    return { notificationPending: !published };
  }

  if (mode === 'outbox') {
    if (deferEnqueue(input.eventIds)) {
      return { notificationPending: false };
    }
    const enqueued = await enqueueEvents(input.eventIds);
    return { notificationPending: !enqueued };
  }

  const [enqueued, published] = await Promise.all([
    enqueueEvents(input.eventIds),
    attemptDirectPublish(input.publishDirect),
  ]);
  return { notificationPending: !enqueued && !published };
}
