import type { PrismaClient } from '@prisma/client';

import { ORDER_EVENT_SCHEMA_VERSION, orderEventPayloadSchema } from '@/domain/orders/order-events';
import { isStoreStaffPushAssociationAuthorized } from '@/server/services/store-staff-push-access';

export async function projectStoreWebPushDispatch(db: PrismaClient, eventId: string) {
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

  const parsed = orderEventPayloadSchema.safeParse(event.payload);
  if (
    event.eventType !== 'ORDER_CREATED' ||
    event.schemaVersion !== ORDER_EVENT_SCHEMA_VERSION ||
    !parsed.success ||
    parsed.data.orderId !== event.orderId ||
    parsed.data.version !== event.aggregateVersion ||
    parsed.data.status !== 'PENDING'
  ) {
    return { projected: false, reason: 'ineligible' } as const;
  }

  return db.$transaction(async (tx) => {
    const dispatch = await tx.storeWebPushDispatch.upsert({
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

    const associations = await tx.storeStaffPushSubscription.findMany({
      where: {
        tenantId: event.tenantId,
        storeId: event.storeId,
        enabledAt: { lte: event.occurredAt },
        disabledAt: null,
      },
      include: {
        membership: { include: { tenant: true, user: true } },
        store: true,
        subscription: true,
      },
    });
    const eligibleByDevice = new Map(
      associations
        .filter((association) => isStoreStaffPushAssociationAuthorized(association))
        .map((association) => [association.webPushSubscriptionId, association]),
    );
    const created = await tx.storeWebPushDelivery.createMany({
      data: [...eligibleByDevice.values()].map((association) => ({
        tenantId: event.tenantId,
        storeId: event.storeId,
        orderId: event.orderId,
        orderOutboxEventId: event.id,
        storeWebPushDispatchId: dispatch.id,
        storeStaffPushSubscriptionId: association.id,
        webPushSubscriptionId: association.webPushSubscriptionId,
        aggregateVersion: event.aggregateVersion,
      })),
      skipDuplicates: true,
    });
    await tx.storeWebPushDispatch.update({
      where: { id: dispatch.id },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });

    return { projected: true, deliveries: created.count } as const;
  });
}

export async function reconcileStoreWebPushDispatches(db: PrismaClient, batchSize = 100) {
  const events = await db.orderOutboxEvent.findMany({
    where: { eventType: 'ORDER_CREATED', storeWebPushDispatch: null },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  let deliveries = 0;
  for (const event of events) {
    const result = await projectStoreWebPushDispatch(db, event.id);
    if (result.projected) deliveries += result.deliveries;
  }
  return { projected: events.length, deliveries };
}
