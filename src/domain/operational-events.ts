import { z } from 'zod';

import { orderOutboxQueueMessageSchema } from '@/domain/orders/order-events';

export const OPERATIONAL_EVENT_SCHEMA_VERSION = 1;

export const diningRoomOperationalPayloadSchema = z.object({
  tableId: z.string().uuid(),
  sessionId: z.string().uuid(),
  reason: z.enum(['REQUEST_OPENED', 'REQUEST_RESOLVED', 'TRANSFERRED', 'CLOSED']),
  version: z.number().int().nonnegative(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const operationalOutboxQueueMessageSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(OPERATIONAL_EVENT_SCHEMA_VERSION),
  stream: z.literal('OPERATIONAL'),
});

export const outboxQueueMessageSchema = z.union([
  operationalOutboxQueueMessageSchema,
  orderOutboxQueueMessageSchema,
]);

export type DiningRoomOperationalPayload = z.infer<typeof diningRoomOperationalPayloadSchema>;
export type OperationalOutboxQueueMessage = z.infer<typeof operationalOutboxQueueMessageSchema>;
export type OutboxQueueMessage = z.infer<typeof outboxQueueMessageSchema>;
