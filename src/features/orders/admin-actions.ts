'use server';

import { getDb } from '@/server/database/client';
import { Permission } from '@/server/permissions';
import { actionSuccess, actionError, type ActionResult, BusinessRuleError } from '@/server/errors';
import { triggerOrderUpdated, triggerPaymentUpdated } from '@/lib/pusher/server';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

// =============================================================================
// Ordens — Admin Server Actions
// =============================================================================

export interface GetOrdersParams {
  status?: OrderStatus;
  statuses?: OrderStatus[];
  paymentStatus?: PaymentStatus;
  dateFrom?: Date;
  dateTo?: Date;
  query?: string;
}

/**
 * Retorna os pedidos da loja atual (pode ser usado no useQuery)
 */
export async function getOrdersAction(params?: GetOrdersParams) {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.VIEW_ORDERS);

    const query = params?.query?.trim();
    const orderNumber = query && /^#?\d+$/.test(query) ? Number(query.replace('#', '')) : null;

    const orders = await getDb().order.findMany({
      where: {
        tenantId: session.tenantId,
        storeId: store.id,
        status: params?.statuses?.length ? { in: params.statuses } : params?.status,
        paymentStatus: params?.paymentStatus,
        createdAt: {
          gte: params?.dateFrom,
          lte: params?.dateTo,
        },
        OR: query
          ? [
              { customerName: { contains: query, mode: 'insensitive' } },
              { customerPhone: { contains: query } },
              ...(orderNumber === null ? [] : [{ orderNumber }]),
            ]
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            options: true,
          },
        },
        payment: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 8,
        },
      },
    });

    return actionSuccess(orders);
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Desfaz somente a transição mais recente feita pelo próprio usuário e dentro
 * de uma janela curta. Isso oferece recuperação sem liberar saltos arbitrários
 * entre estados do pedido.
 */
export async function undoOrderStatusAction(
  orderId: string,
  expectedCurrentStatus: OrderStatus,
  previousStatus: OrderStatus,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.UPDATE_ORDER_STATUS);
    const order = await getDb().order.findUnique({
      where: { id: orderId, tenantId: session.tenantId, storeId: store.id },
      select: {
        id: true,
        storeId: true,
        status: true,
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const latestChange = order?.statusHistory[0];
    const undoWindowMs = 2 * 60 * 1000;
    const isRecent = latestChange
      ? Date.now() - latestChange.createdAt.getTime() <= undoWindowMs
      : false;

    if (
      !order ||
      order.status !== expectedCurrentStatus ||
      !latestChange ||
      latestChange.toStatus !== expectedCurrentStatus ||
      latestChange.fromStatus !== previousStatus ||
      latestChange.changedBy !== session.userId ||
      !isRecent
    ) {
      throw new BusinessRuleError(
        'Esta alteração não pode mais ser desfeita. Atualize a fila e revise o pedido.',
      );
    }

    await getDb().$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: previousStatus } });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: expectedCurrentStatus,
          toStatus: previousStatus,
          changedBy: session.userId,
          note: 'Alteração desfeita pelo painel',
        },
      });
    });

    await triggerOrderUpdated(order.storeId, orderId, previousStatus);
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Atualiza o status de um pedido
 */
export async function updateOrderStatusAction(
  orderId: string,
  newStatus: OrderStatus,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.UPDATE_ORDER_STATUS);

    const order = await getDb().order.findUnique({
      where: { id: orderId, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, storeId: true, status: true },
    });

    if (!order) {
      throw new BusinessRuleError('Pedido não encontrado');
    }

    if (order.status === newStatus) {
      return actionSuccess();
    }

    await getDb().$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: newStatus,
          changedBy: session.userId,
        },
      });
    });

    // Disparar evento Pusher
    await triggerOrderUpdated(order.storeId, orderId, newStatus);

    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Confirma o pagamento de um pedido
 */
export async function confirmPaymentAction(orderId: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.CONFIRM_MANUAL_PAYMENT);

    const order = await getDb().order.findUnique({
      where: { id: orderId, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, storeId: true, paymentStatus: true },
    });

    if (!order) {
      throw new BusinessRuleError('Pedido não encontrado');
    }

    if (order.paymentStatus === 'PAID') {
      throw new BusinessRuleError('Este pedido já está pago');
    }

    await getDb().$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID' },
      });

      await tx.payment.update({
        where: { orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          confirmedBy: session.userId,
        },
      });
    });

    // Disparar evento Pusher
    await triggerPaymentUpdated(order.storeId, orderId, 'PAID');

    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}
