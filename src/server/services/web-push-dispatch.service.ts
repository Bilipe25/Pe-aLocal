import type { OrderOutboxEventType, PrismaClient } from '@prisma/client';

import { ORDER_EVENT_SCHEMA_VERSION, orderEventPayloadSchema } from '@/domain/orders/order-events';
import { WEB_PUSH_EVENT_STATUS, type NotifiableOrderStatus } from '@/lib/web-push/notification';

const ELIGIBLE_EVENT_TYPES = Object.keys(WEB_PUSH_EVENT_STATUS) as OrderOutboxEventType[];

function statusForEvent(eventType: OrderOutboxEventType): NotifiableOrderStatus | null {
  return WEB_PUSH_EVENT_STATUS[eventType as keyof typeof WEB_PUSH_EVENT_STATUS] ?? null;
}

export async function projectWebPushDispatch(db: PrismaClient, eventId: string) {
  const event = await db.orderOutboxEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderId: true,
      eventType: true,
      schemaVersion: true,
      aggregateVersion: true,
      occurredAt: true,
      payload: true,
    },
  });
  if (!event) return { projected: false, reason: 'missing' } as const;
  const expectedStatus = statusForEvent(event.eventType);
  const parsedPayload = orderEventPayloadSchema.safeParse(event.payload);
  const payload = parsedPayload.success ? parsedPayload.data : null;
  if (
    event.schemaVersion !== ORDER_EVENT_SCHEMA_VERSION ||
    !expectedStatus ||
    !payload ||
    payload.status !== expectedStatus ||
    payload.orderId !== event.orderId ||
    payload.version !== event.aggregateVersion
  ) {
    return { projected: false, reason: 'ineligible' } as const;
  }

  return db.$transaction(async (tx) => {
    const dispatch = await tx.webPushDispatch.upsert({
      where: { orderOutboxEventId: event.id },
      create: {
        tenantId: event.tenantId,
        storeId: event.storeId,
        orderId: event.orderId,
        orderOutboxEventId: event.id,
      },
      update: {},
      select: { id: true, status: true },
    });
    if (dispatch.status === 'PROCESSED') return { projected: true, deliveries: 0 } as const;

    const associations = await tx.orderPushSubscription.findMany({
      where: {
        orderId: event.orderId,
        enabledAt: { lte: event.occurredAt },
        disabledAt: null,
        subscription: { revokedAt: null },
      },
      select: { id: true, webPushSubscriptionId: true },
    });
    const created = await tx.webPushDelivery.createMany({
      data: associations.map((association) => ({
        tenantId: event.tenantId,
        storeId: event.storeId,
        orderId: event.orderId,
        orderOutboxEventId: event.id,
        webPushDispatchId: dispatch.id,
        orderPushSubscriptionId: association.id,
        webPushSubscriptionId: association.webPushSubscriptionId,
        orderStatus: expectedStatus,
        aggregateVersion: event.aggregateVersion,
      })),
      skipDuplicates: true,
    });
    await tx.webPushDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });
    return { projected: true, deliveries: created.count } as const;
  });
}

export async function reconcileWebPushDispatches(db: PrismaClient, batchSize = 100) {
  const events = await db.orderOutboxEvent.findMany({
    where: { eventType: { in: ELIGIBLE_EVENT_TYPES }, webPushDispatch: null },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  let deliveries = 0;
  for (const event of events) {
    const result = await projectWebPushDispatch(db, event.id);
    if (result.projected) deliveries += result.deliveries;
  }
  return { projected: events.length, deliveries };
}
