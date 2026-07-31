import type { PrismaClient } from '@prisma/client';

import type { OrderOutboxQueueMessage } from '../../src/domain/orders/order-events';
import { orderOutboxQueueMessageSchema } from '../../src/domain/orders/order-events';
import { createOrderEventPublisher } from '../../src/lib/pusher/order-event-publisher';
import { createDatabaseClient } from '../../src/server/database/factory';
import {
  processOrderOutboxMessage,
  relayPendingOrderOutboxEvents,
} from '../../src/server/services/order-outbox-processor';
import { purgeProcessedOrderOutboxEvents } from '../../src/server/services/order-outbox-retention';

const CONSUMER_GROUP_CONCURRENCY = 3;
const RETENTION_UTC_MINUTE = 17;

interface OrderEventsEnv {
  HYPERDRIVE: Hyperdrive;
  ORDER_OUTBOX_QUEUE: Queue<OrderOutboxQueueMessage>;
  ORDER_OUTBOX_DLQ: Queue<OrderOutboxQueueMessage>;
  PUSHER_APP_ID: string;
  PUSHER_KEY: string;
  PUSHER_SECRET: string;
  PUSHER_CLUSTER: string;
  PUSHER_LEGACY_PUBLIC_CHANNELS?: string;
  ORDER_OUTBOX_RELAY_ENABLED?: string;
  ORDER_OUTBOX_RETENTION_ENABLED?: string;
  ORDER_OUTBOX_RETENTION_DAYS?: string;
}

function database(env: OrderEventsEnv) {
  return createDatabaseClient(env.HYPERDRIVE.connectionString);
}

function publisher(env: OrderEventsEnv, db: PrismaClient) {
  if (!env.PUSHER_APP_ID || !env.PUSHER_KEY || !env.PUSHER_SECRET || !env.PUSHER_CLUSTER) {
    throw new Error('Pusher credentials are required by the order events worker.');
  }
  const publicTokenByOrder = new Map<string, Promise<string | null>>();
  return createOrderEventPublisher({
    appId: env.PUSHER_APP_ID,
    key: env.PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.PUSHER_CLUSTER,
    includeLegacyPublicChannel: env.PUSHER_LEGACY_PUBLIC_CHANNELS === 'true',
    resolvePublicToken: async (orderId) => {
      let pending = publicTokenByOrder.get(orderId);
      if (!pending) {
        pending = db.order
          .findUnique({
            where: { id: orderId },
            select: { publicToken: true },
          })
          .then((order) => order?.publicToken ?? null);
        publicTokenByOrder.set(orderId, pending);
      }
      return pending;
    },
  });
}

type OrderQueueMessage = Message<OrderOutboxQueueMessage>;

async function groupMessagesByAggregate(db: PrismaClient, messages: readonly OrderQueueMessage[]) {
  const parsed = messages.map((message, index) => ({
    message,
    index,
    body: orderOutboxQueueMessageSchema.safeParse(message.body),
  }));
  const eventIds = [
    ...new Set(parsed.flatMap(({ body }) => (body.success ? [body.data.eventId] : []))),
  ];
  const metadata = eventIds.length
    ? await db.orderOutboxEvent.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, orderId: true, aggregateVersion: true },
      })
    : [];
  const byEventId = new Map(metadata.map((event) => [event.id, event]));
  const groups = new Map<
    string,
    Array<{ message: OrderQueueMessage; aggregateVersion: number; index: number }>
  >();

  for (const item of parsed) {
    const event = item.body.success ? byEventId.get(item.body.data.eventId) : undefined;
    const key = event ? `order:${event.orderId}` : `message:${item.index}`;
    const group = groups.get(key) ?? [];
    group.push({
      message: item.message,
      aggregateVersion: event?.aggregateVersion ?? Number.MAX_SAFE_INTEGER,
      index: item.index,
    });
    groups.set(key, group);
  }

  return [...groups.values()].map((group) =>
    group.sort(
      (left, right) => left.aggregateVersion - right.aggregateVersion || left.index - right.index,
    ),
  );
}

async function runWithBoundedConcurrency(
  groups: Awaited<ReturnType<typeof groupMessagesByAggregate>>,
  operation: (group: (typeof groups)[number]) => Promise<void>,
) {
  let next = 0;
  const workerCount = Math.min(CONSUMER_GROUP_CONCURRENCY, groups.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < groups.length) {
        const group = groups[next];
        next += 1;
        if (group) await operation(group);
      }
    }),
  );
}

function retryRemainder(
  group: Awaited<ReturnType<typeof groupMessagesByAggregate>>[number],
  fromIndex: number,
  delaySeconds: number,
) {
  for (let index = fromIndex; index < group.length; index += 1) {
    group[index]?.message.retry({ delaySeconds });
  }
}

function retentionDays(env: OrderEventsEnv) {
  const parsed = Number(env.ORDER_OUTBOX_RETENTION_DAYS ?? '30');
  return Number.isSafeInteger(parsed) && parsed >= 7 && parsed <= 3650 ? parsed : 30;
}

export function shouldRunOrderOutboxRetention(scheduledTime: number) {
  const scheduledAt = new Date(scheduledTime);
  return scheduledAt.getUTCMinutes() === RETENTION_UTC_MINUTE;
}

async function disconnect(db: PrismaClient) {
  try {
    await db.$disconnect();
  } catch (error) {
    console.error('[ORDER_OUTBOX_DATABASE_DISCONNECT_FAILED]', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export default {
  async queue(batch: MessageBatch<OrderOutboxQueueMessage>, env: OrderEventsEnv) {
    const db = database(env);
    const startedAt = Date.now();
    try {
      const eventPublisher = publisher(env, db);
      const groups = await groupMessagesByAggregate(db, batch.messages);
      const outcomes = { acknowledged: 0, retried: 0, deadLettered: 0 };
      await runWithBoundedConcurrency(groups, async (group) => {
        for (let index = 0; index < group.length; index += 1) {
          const item = group[index];
          if (!item) continue;
          const { message } = item;
          try {
            const result = await processOrderOutboxMessage(
              db,
              eventPublisher,
              message.body,
              message.attempts,
              message.id,
            );
            if (result.action === 'ack') {
              message.ack();
              outcomes.acknowledged += 1;
            } else if (result.action === 'dead-letter') {
              await env.ORDER_OUTBOX_DLQ.send(message.body, { contentType: 'json' });
              message.ack();
              outcomes.deadLettered += 1;
            } else {
              retryRemainder(group, index, result.delaySeconds);
              outcomes.retried += group.length - index;
              break;
            }
          } catch (error) {
            console.error('[ORDER_OUTBOX_CONSUMER_UNHANDLED]', {
              queueMessageId: message.id,
              attempts: message.attempts,
              error: error instanceof Error ? error.message : 'unknown',
            });
            retryRemainder(group, index, 30);
            outcomes.retried += group.length - index;
            break;
          }
        }
      });
      console.info('[ORDER_OUTBOX_BATCH_COMPLETED]', {
        messages: batch.messages.length,
        aggregates: groups.length,
        durationMs: Date.now() - startedAt,
        ...outcomes,
      });
    } catch (error) {
      console.error('[ORDER_OUTBOX_WORKER_UNAVAILABLE]', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      batch.retryAll({ delaySeconds: 30 });
    } finally {
      await disconnect(db);
    }
  },

  async scheduled(controller: ScheduledController, env: OrderEventsEnv) {
    const relayEnabled = env.ORDER_OUTBOX_RELAY_ENABLED === 'true';
    const retentionEnabled =
      env.ORDER_OUTBOX_RETENTION_ENABLED === 'true' &&
      shouldRunOrderOutboxRetention(controller.scheduledTime);
    if (!relayEnabled && !retentionEnabled) return;
    const db = database(env);
    try {
      if (relayEnabled) {
        await relayPendingOrderOutboxEvents(db, env.ORDER_OUTBOX_QUEUE, env.ORDER_OUTBOX_DLQ);
      }
      if (retentionEnabled) {
        const retentionStartedAt = Date.now();
        const result = await purgeProcessedOrderOutboxEvents(db, {
          retentionDays: retentionDays(env),
        });
        console.info('[ORDER_OUTBOX_RETENTION_COMPLETED]', {
          deleted: result.deleted,
          retentionDays: result.retentionDays,
          durationMs: Date.now() - retentionStartedAt,
        });
      }
    } finally {
      await disconnect(db);
    }
  },
} satisfies ExportedHandler<OrderEventsEnv, OrderOutboxQueueMessage>;
