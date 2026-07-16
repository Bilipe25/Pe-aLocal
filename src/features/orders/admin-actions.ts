'use server';

import { getDb } from '@/server/database/client';
import { requirePermission } from '@/server/auth';
import { Permission } from '@/server/permissions';
import { actionSuccess, actionError, type ActionResult, BusinessRuleError } from '@/server/errors';
import { triggerOrderUpdated, triggerPaymentUpdated } from '@/lib/pusher/server';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

// =============================================================================
// Ordens — Admin Server Actions
// =============================================================================

export interface GetOrdersParams {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Retorna os pedidos da loja atual (pode ser usado no useQuery)
 */
export async function getOrdersAction(params?: GetOrdersParams) {
  try {
    const session = await requirePermission(Permission.VIEW_ORDERS);

    // Para o MVP, se o usuário não tem storeId fixo (dono de tudo), precisa pegar o primeiro store ou passar por param.
    // Vamos assumir que a loja principal é a que tem pedidos, ou buscar a storeId.
    let storeId = session.storeId;
    if (!storeId) {
      const firstStore = await getDb().store.findFirst({
        where: { tenantId: session.tenantId },
        select: { id: true },
      });
      if (firstStore) {
        storeId = firstStore.id;
      } else {
        return actionSuccess([]); // Sem lojas
      }
    }

    const orders = await getDb().order.findMany({
      where: {
        tenantId: session.tenantId,
        storeId,
        status: params?.status,
        paymentStatus: params?.paymentStatus,
        createdAt: {
          gte: params?.dateFrom,
          lte: params?.dateTo,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            options: true,
          },
        },
        payment: true,
      },
    });

    return actionSuccess(orders);
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
    const session = await requirePermission(Permission.UPDATE_ORDER_STATUS);

    const order = await getDb().order.findUnique({
      where: { id: orderId, tenantId: session.tenantId },
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
    const session = await requirePermission(Permission.CONFIRM_MANUAL_PAYMENT);

    const order = await getDb().order.findUnique({
      where: { id: orderId, tenantId: session.tenantId },
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
