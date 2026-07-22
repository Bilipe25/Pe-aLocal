import 'server-only';

import type { OrderVersionInput } from '@/features/orders/schemas';
import { getDb } from '@/server/database/client';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  OrderPaymentConsistencyError,
} from '@/server/errors';
import * as orderAudit from './order-audit.service';
import type {
  OrderMutationContext,
  OrderMutationResult,
} from './order-mutation.types';

const ORDER_CONFLICT_MESSAGE =
  'Este pedido foi alterado por outra pessoa. Atualize a central antes de continuar.';

export async function confirmManualPayment(
  context: OrderMutationContext,
  input: OrderVersionInput,
): Promise<OrderMutationResult> {
  if (!context.canConfirmPayment) {
    throw new AuthorizationError('Seu perfil não possui permissão para confirmar pagamentos.');
  }

  return getDb().$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: input.orderId,
        tenantId: context.tenantId,
        storeId: context.storeId,
      },
      select: {
        id: true,
        storeId: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        version: true,
        payment: { select: { id: true, status: true, method: true } },
      },
    });

    if (!order) throw new NotFoundError('Pedido');
    if (order.version !== input.expectedVersion) {
      throw new ConflictError(ORDER_CONFLICT_MESSAGE);
    }
    if (
      !order.payment ||
      order.payment.status !== order.paymentStatus ||
      order.payment.method !== order.paymentMethod
    ) {
      throw new OrderPaymentConsistencyError();
    }
    if (order.status === 'CANCELLED') {
      throw new BusinessRuleError('Um pedido cancelado não pode ser marcado como pago.');
    }
    if (!['PENDING', 'CUSTOMER_REPORTED_PAID'].includes(order.paymentStatus)) {
      throw new BusinessRuleError('Este pagamento não pode ser confirmado no estado atual.');
    }

    const paidAt = new Date();
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: context.tenantId,
        storeId: context.storeId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        version: input.expectedVersion,
      },
      data: {
        paymentStatus: 'PAID',
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConflictError(ORDER_CONFLICT_MESSAGE);

    const paymentUpdated = await tx.payment.updateMany({
      where: {
        orderId: order.id,
        method: order.paymentMethod,
        status: order.paymentStatus,
      },
      data: {
        status: 'PAID',
        paidAt,
        confirmedBy: context.userId,
      },
    });
    if (paymentUpdated.count !== 1) throw new ConflictError(ORDER_CONFLICT_MESSAGE);

    await orderAudit.writePaymentAudit(tx, context, {
      orderId: order.id,
      paymentId: order.payment.id,
      action: 'PAYMENT_CONFIRMED',
      previousStatus: order.paymentStatus,
      nextStatus: 'PAID',
      previousVersion: input.expectedVersion,
      nextVersion: input.expectedVersion + 1,
    });

    return {
      orderId: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentStatus: 'PAID',
      version: input.expectedVersion + 1,
      paymentUpdated: true,
    };
  });
}
