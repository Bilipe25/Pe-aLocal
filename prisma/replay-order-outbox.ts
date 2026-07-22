import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

import { createDatabaseClient } from '../src/server/database/factory';

loadEnv({ path: path.join(process.cwd(), '.env.local') });

const eventId = z.string().uuid().parse(process.argv[2]);
const operator = z.string().min(1).parse(process.env.OUTBOX_REPLAY_OPERATOR);
const connectionString = z.string().min(1).parse(process.env.DIRECT_URL);
const db = createDatabaseClient(connectionString);

try {
  await db.$transaction(async (tx) => {
    const event = await tx.orderOutboxEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        orderId: true,
        status: true,
        attempts: true,
        lastError: true,
      },
    });
    if (!event) throw new Error('Order outbox event not found.');
    if (event.status !== 'FAILED') throw new Error('Only FAILED outbox events can be replayed.');

    const replayed = await tx.orderOutboxEvent.updateMany({
      where: { id: event.id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        queuedAt: null,
        lockedAt: null,
        lockToken: null,
        processedAt: null,
        failedAt: null,
        lastError: null,
      },
    });
    if (replayed.count !== 1) throw new Error('Outbox event changed during replay.');

    await tx.auditLog.create({
      data: {
        tenantId: event.tenantId,
        storeId: event.storeId,
        action: 'UPDATE',
        entity: 'OrderOutboxEvent',
        entityId: event.id,
        metadata: {
          operation: 'OUTBOX_REPLAY',
          operator,
          orderId: event.orderId,
          previousAttempts: event.attempts,
          previousError: event.lastError,
        },
      },
    });
  });
  console.info('[ORDER_OUTBOX_REPLAYED]', { eventId });
} finally {
  await db.$disconnect();
}
