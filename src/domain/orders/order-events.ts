import { z } from 'zod';

export const ORDER_EVENT_SCHEMA_VERSION = 1;

export const orderEventPayloadSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.number().int().positive(),
  status: z.enum([
    'PENDING',
    'AWAITING_PAYMENT',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
  ]),
  paymentStatus: z.enum([
    'PENDING',
    'CUSTOMER_REPORTED_PAID',
    'PAID',
    'FAILED',
    'CANCELLED',
    'REFUNDED',
  ]),
  version: z.number().int().nonnegative(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const orderOutboxQueueMessageSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(ORDER_EVENT_SCHEMA_VERSION),
});

export type OrderEventPayload = z.infer<typeof orderEventPayloadSchema>;
export type OrderOutboxQueueMessage = z.infer<typeof orderOutboxQueueMessageSchema>;
