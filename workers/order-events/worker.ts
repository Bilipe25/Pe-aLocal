import type { PrismaClient } from '@prisma/client';

import type { OrderOutboxQueueMessage } from '../../src/domain/orders/order-events';
import { createOrderEventPublisher } from '../../src/lib/pusher/order-event-publisher';
import { createDatabaseClient } from '../../src/server/database/factory';
import {
  processOrderOutboxMessage,
  relayPendingOrderOutboxEvents,
} from '../../src/server/services/order-outbox-processor';

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
}

function database(env: OrderEventsEnv) {
  return createDatabaseClient(env.HYPERDRIVE.connectionString);
}

function publisher(env: OrderEventsEnv, db: PrismaClient) {
  if (!env.PUSHER_APP_ID || !env.PUSHER_KEY || !env.PUSHER_SECRET || !env.PUSHER_CLUSTER) {
    throw new Error('Pusher credentials are required by the order events worker.');
  }
  return createOrderEventPublisher({
    appId: env.PUSHER_APP_ID,
    key: env.PUSHER_KEY,
    secret: env.PUSHER_SECRET,
    cluster: env.PUSHER_CLUSTER,
    includeLegacyPublicChannel: env.PUSHER_LEGACY_PUBLIC_CHANNELS === 'true',
    resolvePublicToken: async (orderId) => {
      const order = await db.order.findUnique({
        where: { id: orderId },
        select: { publicToken: true },
      });
      return order?.publicToken ?? null;
    },
  });
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
    try {
      const eventPublisher = publisher(env, db);
      for (const message of batch.messages) {
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
          } else if (result.action === 'dead-letter') {
            await env.ORDER_OUTBOX_DLQ.send(message.body, { contentType: 'json' });
            message.ack();
          } else {
            message.retry({ delaySeconds: result.delaySeconds });
          }
        } catch (error) {
          console.error('[ORDER_OUTBOX_CONSUMER_UNHANDLED]', {
            queueMessageId: message.id,
            attempts: message.attempts,
            error: error instanceof Error ? error.message : 'unknown',
          });
          message.retry({ delaySeconds: 30 });
        }
      }
    } catch (error) {
      console.error('[ORDER_OUTBOX_WORKER_UNAVAILABLE]', {
        error: error instanceof Error ? error.message : 'unknown',
      });
      batch.retryAll({ delaySeconds: 30 });
    } finally {
      await disconnect(db);
    }
  },

  async scheduled(_controller: ScheduledController, env: OrderEventsEnv) {
    if (env.ORDER_OUTBOX_RELAY_ENABLED !== 'true') return;
    const db = database(env);
    try {
      await relayPendingOrderOutboxEvents(db, env.ORDER_OUTBOX_QUEUE, env.ORDER_OUTBOX_DLQ);
    } finally {
      await disconnect(db);
    }
  },
} satisfies ExportedHandler<OrderEventsEnv, OrderOutboxQueueMessage>;
