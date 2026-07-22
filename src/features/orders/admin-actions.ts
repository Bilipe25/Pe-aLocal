'use server';

import { hasTenantPermission, Permission } from '@/server/permissions';
import { actionSuccess, actionError, type ActionResult, ValidationError } from '@/server/errors';
import { triggerOrderUpdated, triggerPaymentUpdated } from '@/lib/pusher/server';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import {
  cancelOrderInputSchema,
  markPaymentFailedInputSchema,
  orderVersionInputSchema,
  refundPaymentInputSchema,
  type CancelOrderInput,
  type OrderVersionInput,
} from './schemas';
import * as workflowService from '@/server/services/order-workflow.service';
import * as paymentService from '@/server/services/order-payment.service';
import type {
  OrderMutationContext,
  OrderMutationResult,
} from '@/server/services/order-mutation.types';
import type { z } from 'zod';
import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';

// =============================================================================
// Ordens — Admin Server Actions
// =============================================================================

export interface OrderActionData {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  notificationPending: boolean;
}

function parseActionInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Os dados enviados para atualizar o pedido são inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function mutationContext(
  context: Awaited<ReturnType<typeof requireActiveStoreContext>>,
): OrderMutationContext {
  return {
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    userId: context.session.userId,
    userName: context.session.name,
    canConfirmPayment: hasTenantPermission(
      context.session.tenantRole,
      Permission.CONFIRM_MANUAL_PAYMENT,
    ),
    canRefundPayment: hasTenantPermission(context.session.tenantRole, Permission.REFUND_PAYMENT),
  };
}

async function publishMutation(
  result: workflowService.OrderMutationResult,
  publishOrder: boolean,
): Promise<boolean> {
  const dispatch = await dispatchCommittedOrderEvents({
    eventIds: result.outboxEventIds,
    publishDirect: async () => {
      const publications: Promise<unknown>[] = [];
      if (publishOrder) {
        publications.push(triggerOrderUpdated(result.storeId, result.orderId, result.status));
      }
      if (result.paymentUpdated) {
        publications.push(
          triggerPaymentUpdated(result.storeId, result.orderId, result.paymentStatus),
        );
      }
      const outcomes = await Promise.allSettled(publications);
      const failed = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    },
  });
  return dispatch.notificationPending;
}

async function runStatusAction(
  rawInput: unknown,
  permission: Permission,
  operation: (
    context: OrderMutationContext,
    input: OrderVersionInput,
  ) => Promise<OrderMutationResult>,
): Promise<ActionResult<OrderActionData>> {
  try {
    const input = parseActionInput(orderVersionInputSchema, rawInput);
    const context = await requireActiveStoreContext(permission);
    const result = await operation(mutationContext(context), input);
    const notificationPending = await publishMutation(result, true);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}

export async function acceptOrderAction(input: unknown): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(input, Permission.ACCEPT_ORDERS, workflowService.acceptOrder);
}

export async function startOrderPreparationAction(
  input: unknown,
): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(
    input,
    Permission.UPDATE_ORDER_STATUS,
    workflowService.startOrderPreparation,
  );
}

export async function markOrderReadyAction(input: unknown): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(input, Permission.UPDATE_ORDER_STATUS, workflowService.markOrderReady);
}

export async function dispatchOrderAction(input: unknown): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(input, Permission.UPDATE_ORDER_STATUS, workflowService.dispatchOrder);
}

export async function completeOrderAction(input: unknown): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(input, Permission.COMPLETE_ORDERS, workflowService.completeOrder);
}

export async function cancelOrderAction(rawInput: unknown): Promise<ActionResult<OrderActionData>> {
  try {
    const input: CancelOrderInput = parseActionInput(cancelOrderInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.CANCEL_ORDERS);
    const result = await workflowService.cancelOrder(mutationContext(context), input);
    const notificationPending = await publishMutation(result, true);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}

export async function undoLastOrderTransitionAction(
  input: unknown,
): Promise<ActionResult<OrderActionData>> {
  return runStatusAction(
    input,
    Permission.UPDATE_ORDER_STATUS,
    workflowService.undoLastOrderTransition,
  );
}

export async function confirmPaymentAction(
  rawInput: unknown,
): Promise<ActionResult<OrderActionData>> {
  try {
    const input = parseActionInput(orderVersionInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.CONFIRM_MANUAL_PAYMENT);
    const result = await paymentService.confirmManualPayment(mutationContext(context), input);
    const notificationPending = await publishMutation(result, false);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}

export async function markPaymentFailedAction(
  rawInput: unknown,
): Promise<ActionResult<OrderActionData>> {
  try {
    const input = parseActionInput(markPaymentFailedInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.CONFIRM_MANUAL_PAYMENT);
    const result = await paymentService.markPaymentFailed(mutationContext(context), input);
    const notificationPending = await publishMutation(result, false);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}

export async function retryFailedPaymentAction(
  rawInput: unknown,
): Promise<ActionResult<OrderActionData>> {
  try {
    const input = parseActionInput(orderVersionInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.CONFIRM_MANUAL_PAYMENT);
    const result = await paymentService.retryFailedPayment(mutationContext(context), input);
    const notificationPending = await publishMutation(result, false);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}

export async function refundPaymentAction(
  rawInput: unknown,
): Promise<ActionResult<OrderActionData>> {
  try {
    const input = parseActionInput(refundPaymentInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.REFUND_PAYMENT);
    const result = await paymentService.refundPayment(mutationContext(context), input);
    const notificationPending = await publishMutation(result, false);
    return actionSuccess({ ...result, notificationPending });
  } catch (error) {
    return actionError(error);
  }
}
