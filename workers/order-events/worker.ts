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
import {
  projectStoreWebPushDispatch,
  reconcileStoreWebPushDispatches,
} from '../../src/server/services/store-web-push-dispatch.service';
import {
  processPendingStoreWebPushDeliveries,
  processStoreWebPushDeliveriesForEvent,
  sendStoreStaffPushTest,
} from '../../src/server/services/store-web-push-delivery.service';
import {
  projectWebPushDispatch,
  reconcileWebPushDispatches,
} from '../../src/server/services/web-push-dispatch.service';
import {
  processPendingWebPushDeliveries,
  processWebPushDeliveriesForEvent,
} from '../../src/server/services/web-push-delivery.service';
import { readWebPushSenderConfig } from '../../src/server/services/web-push-sender';
import { revokeExpiredWebPushSubscriptions } from '../../src/server/services/web-push-revocation.service';

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
  WEB_PUSH_ENABLED?: string;
  MERCHANT_WEB_PUSH_ENABLED?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  WEB_PUSH_VAPID_SUBJECT?: string;
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

async function processFastWebPush(
  db: PrismaClient,
  config: ReturnType<typeof readWebPushSenderConfig>,
  rawMessage: unknown,
) {
  if (!config) return;
  const parsed = orderOutboxQueueMessageSchema.safeParse(rawMessage);
  if (!parsed.success) return;
  const eventId = parsed.data.eventId;
  try {
    await projectWebPushDispatch(db, eventId);
    const delivery = await processWebPushDeliveriesForEvent(db, config, eventId);
    console.info('[WEB_PUSH_FAST_CYCLE_COMPLETED]', { eventId, ...delivery });
  } catch (error) {
    console.error('[WEB_PUSH_FAST_CYCLE_FAILED]', {
      eventId,
      error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
    });
  }
}

async function processFastStoreWebPush(
  db: PrismaClient,
  config: ReturnType<typeof readWebPushSenderConfig>,
  rawMessage: unknown,
) {
  if (!config) return;
  const parsed = orderOutboxQueueMessageSchema.safeParse(rawMessage);
  if (!parsed.success) return;
  const eventId = parsed.data.eventId;
  try {
    await projectStoreWebPushDispatch(db, eventId);
    const delivery = await processStoreWebPushDeliveriesForEvent(db, config, eventId);
    console.info('[MERCHANT_WEB_PUSH_FAST_CYCLE_COMPLETED]', { eventId, ...delivery });
  } catch (error) {
    console.error('[MERCHANT_WEB_PUSH_FAST_CYCLE_FAILED]', {
      eventId,
      error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
    });
  }
}

export default {
  async queue(batch: MessageBatch<OrderOutboxQueueMessage>, env: OrderEventsEnv) {
    const db = database(env);
    const startedAt = Date.now();
    try {
      const eventPublisher = publisher(env, db);
      const webPushConfig = env.WEB_PUSH_ENABLED === 'true' ? readWebPushSenderConfig(env) : null;
      const merchantWebPushConfig = readWebPushSenderConfig(
        env,
        env.MERCHANT_WEB_PUSH_ENABLED === 'true',
      );
      if (env.WEB_PUSH_ENABLED === 'true' && !webPushConfig) {
        console.error('[WEB_PUSH_CONFIGURATION_MISSING]');
      }
      if (env.MERCHANT_WEB_PUSH_ENABLED === 'true' && !merchantWebPushConfig) {
        console.error('[MERCHANT_WEB_PUSH_CONFIGURATION_MISSING]');
      }
      const groups = await groupMessagesByAggregate(db, batch.messages);
      const outcomes = { acknowledged: 0, retried: 0, deadLettered: 0 };
      await runWithBoundedConcurrency(groups, async (group) => {
        for (let index = 0; index < group.length; index += 1) {
          const item = group[index];
          if (!item) continue;
          const { message } = item;
          try {
            await processFastStoreWebPush(db, merchantWebPushConfig, message.body);
            await processFastWebPush(db, webPushConfig, message.body);
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
    const webPushEnabled = env.WEB_PUSH_ENABLED === 'true';
    const merchantWebPushEnabled = env.MERCHANT_WEB_PUSH_ENABLED === 'true';
    if (!relayEnabled && !retentionEnabled && !webPushEnabled && !merchantWebPushEnabled) return;
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
      if (webPushEnabled) {
        const config = readWebPushSenderConfig(env);
        if (!config) {
          console.error('[WEB_PUSH_CONFIGURATION_MISSING]');
        } else {
          try {
            const projection = await reconcileWebPushDispatches(db);
            const delivery = await processPendingWebPushDeliveries(db, config);
            console.info('[WEB_PUSH_CYCLE_COMPLETED]', { ...projection, ...delivery });
          } catch (error) {
            console.error('[WEB_PUSH_CYCLE_FAILED]', {
              error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
            });
          }
        }
      }
      if (merchantWebPushEnabled) {
        const config = readWebPushSenderConfig(env, true);
        if (!config) {
          console.error('[MERCHANT_WEB_PUSH_CONFIGURATION_MISSING]');
        } else {
          try {
            const projection = await reconcileStoreWebPushDispatches(db);
            const delivery = await processPendingStoreWebPushDeliveries(db, config);
            console.info('[MERCHANT_WEB_PUSH_CYCLE_COMPLETED]', {
              ...projection,
              ...delivery,
            });
          } catch (error) {
            console.error('[MERCHANT_WEB_PUSH_CYCLE_FAILED]', {
              error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
            });
          }
        }
      }
      if (webPushEnabled || merchantWebPushEnabled) {
        const expired = await revokeExpiredWebPushSubscriptions(db);
        if (expired.revoked > 0) console.info('[WEB_PUSH_EXPIRED_REVOKED]', expired);
      }
    } finally {
      await disconnect(db);
    }
  },

  async fetch(request: Request, env: OrderEventsEnv) {
    if (
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/internal/merchant-push/test'
    ) {
      return new Response('Not found', { status: 404 });
    }
    if (env.MERCHANT_WEB_PUSH_ENABLED !== 'true') {
      return Response.json({ sent: false, reason: 'disabled' }, { status: 503 });
    }
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 1_024) return Response.json({ error: 'invalid_request' }, { status: 413 });
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
      return Response.json({ error: 'invalid_request' }, { status: 413 });
    }
    const body = (() => {
      try {
        return JSON.parse(rawBody) as unknown;
      } catch {
        return null;
      }
    })();
    const associationId =
      body && typeof body === 'object' && 'associationId' in body ? String(body.associationId) : '';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        associationId,
      )
    ) {
      return Response.json({ error: 'invalid_request' }, { status: 400 });
    }
    const config = readWebPushSenderConfig(env, true);
    if (!config) return Response.json({ sent: false, reason: 'configuration' }, { status: 503 });
    const db = database(env);
    try {
      const result = await sendStoreStaffPushTest(db, config, associationId);
      return Response.json(result, { status: result.sent ? 200 : 422 });
    } finally {
      await disconnect(db);
    }
  },
} satisfies ExportedHandler<OrderEventsEnv, OrderOutboxQueueMessage>;
