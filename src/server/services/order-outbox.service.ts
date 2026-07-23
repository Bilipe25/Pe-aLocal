import 'server-only';

import type { OrderOutboxEventType, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

import { ORDER_EVENT_SCHEMA_VERSION, type OrderEventPayload } from '@/domain/orders/order-events';

type OutboxClient = Pick<Prisma.TransactionClient, 'orderOutboxEvent'>;

export async function appendOrderOutboxEvent(
  tx: OutboxClient,
  data: {
    tenantId: string;
    storeId: string;
    orderId: string;
    auditLogId: string;
    eventType: OrderOutboxEventType;
    orderNumber: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    aggregateVersion: number;
    occurredAt: Date;
  },
) {
  const payload: OrderEventPayload = {
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    status: data.status,
    paymentStatus: data.paymentStatus,
    version: data.aggregateVersion,
    occurredAt: data.occurredAt.toISOString(),
  };

  return tx.orderOutboxEvent.create({
    data: {
      tenantId: data.tenantId,
      storeId: data.storeId,
      orderId: data.orderId,
      auditLogId: data.auditLogId,
      eventType: data.eventType,
      aggregateVersion: data.aggregateVersion,
      schemaVersion: ORDER_EVENT_SCHEMA_VERSION,
      payload,
      occurredAt: data.occurredAt,
    },
    select: { id: true },
  });
}
