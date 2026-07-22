import 'server-only';

import { decodeOrderCursor, encodeOrderCursor } from '@/lib/orders/cursor';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError } from '@/server/errors';
import type { AddInternalOrderNoteInput } from '@/features/orders/schemas';
import type { OrderInternalNotesInput } from '@/features/orders/query-schemas';
import type { OrderInternalNotesPageDTO } from '@/types/order-query';
import type { OrderMutationContext, OrderMutationResult } from './order-mutation.types';
import { writeOrderInternalNoteAudit } from './order-audit.service';
import { appendOrderOutboxEvent } from './order-outbox.service';

type InternalNoteScope = Pick<OrderMutationContext, 'tenantId' | 'storeId'>;

export async function getOrderInternalNotes(
  context: InternalNoteScope,
  orderId: string,
  input: Pick<OrderInternalNotesInput, 'cursor' | 'pageSize'>,
): Promise<OrderInternalNotesPageDTO> {
  const order = await getDb().order.findFirst({
    where: { id: orderId, tenantId: context.tenantId, storeId: context.storeId },
    select: { id: true },
  });
  if (!order) throw new NotFoundError('Pedido');

  const cursor = input.cursor ? decodeOrderCursor(input.cursor) : null;
  const notes = await getDb().orderInternalNote.findMany({
    where: {
      tenantId: context.tenantId,
      storeId: context.storeId,
      orderId,
      deletedAt: null,
      OR: cursor
        ? [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ]
        : undefined,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.pageSize + 1,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });
  const hasNextPage = notes.length > input.pageSize;
  const page = hasNextPage ? notes.slice(0, input.pageSize) : notes;
  const last = page.at(-1);
  return {
    items: page.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author.name,
      createdAt: note.createdAt.toISOString(),
    })),
    nextCursor:
      hasNextPage && last ? encodeOrderCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

export async function addOrderInternalNote(
  context: OrderMutationContext,
  input: AddInternalOrderNoteInput,
): Promise<OrderMutationResult & { noteId: string }> {
  return getDb().$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, tenantId: context.tenantId, storeId: context.storeId },
      select: {
        id: true,
        storeId: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        version: true,
      },
    });
    if (!order) throw new NotFoundError('Pedido');
    if (order.version !== input.expectedVersion) {
      throw new ConflictError(
        'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.',
      );
    }

    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: context.tenantId,
        storeId: context.storeId,
        version: input.expectedVersion,
      },
      data: { version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictError(
        'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.',
      );
    }

    const createdAt = new Date();
    const note = await tx.orderInternalNote.create({
      data: {
        tenantId: context.tenantId,
        storeId: context.storeId,
        orderId: order.id,
        authorUserId: context.userId,
        body: input.body,
        createdAt,
      },
      select: { id: true },
    });
    const auditLogId = await writeOrderInternalNoteAudit(tx, context, {
      orderId: order.id,
      noteId: note.id,
      bodyLength: input.body.length,
      previousVersion: input.expectedVersion,
      nextVersion: input.expectedVersion + 1,
    });
    const event = await appendOrderOutboxEvent(tx, {
      tenantId: context.tenantId,
      storeId: context.storeId,
      orderId: order.id,
      auditLogId,
      eventType: 'ORDER_INTERNAL_NOTE_ADDED',
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      aggregateVersion: input.expectedVersion + 1,
      occurredAt: createdAt,
    });

    return {
      noteId: note.id,
      orderId: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      version: input.expectedVersion + 1,
      paymentUpdated: false,
      outboxEventIds: [event.id],
    };
  });
}
