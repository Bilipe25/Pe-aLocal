'use server';

import { triggerOrderUpdated, triggerPaymentUpdated } from '@/lib/pusher/server';
import { posOrderSchema, posQuoteSchema } from '@/schemas/pos';
import { actionError, actionSuccess, CheckoutError, type ActionResult } from '@/server/errors';
import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';
import {
  calculatePosQuote,
  createPosOrder,
  lookupPosCustomerByPhone,
} from '@/server/services/pos-order.service';

export async function quotePosOrderAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof calculatePosQuote>>>> {
  try {
    const parsed = posQuoteSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new CheckoutError(
        'CART_INVALID',
        'Revise os dados do pedido.',
        422,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return actionSuccess(await calculatePosQuote(parsed.data));
  } catch (error) {
    console.error('[POS_QUOTE_FAILED]', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    return actionError(error);
  }
}

export async function createPosOrderAction(rawInput: unknown): Promise<
  ActionResult<{
    orderId: string;
    orderNumber: number;
    publicToken: string;
    status: 'CONFIRMED';
    paymentStatus: 'PENDING' | 'PAID';
    notificationPending: boolean;
    created: boolean;
  }>
> {
  try {
    const parsed = posOrderSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new CheckoutError(
        'CART_INVALID',
        'Revise os dados do pedido.',
        422,
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    const result = await createPosOrder(parsed.data);
    const paymentStatus = parsed.data.paidNow ? 'PAID' : 'PENDING';
    const dispatch = await dispatchCommittedOrderEvents({
      eventIds: result.outboxEventIds,
      publishDirect: async () => {
        const publications: Promise<unknown>[] = [
          triggerOrderUpdated(result.storeId, result.id, 'CONFIRMED'),
        ];
        if (parsed.data.paidNow) {
          publications.push(triggerPaymentUpdated(result.storeId, result.id, paymentStatus));
        }
        const outcomes = await Promise.allSettled(publications);
        const failed = outcomes.find((outcome) => outcome.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      },
    });
    return actionSuccess({
      orderId: result.id,
      orderNumber: result.orderNumber,
      publicToken: result.publicToken,
      status: 'CONFIRMED',
      paymentStatus,
      notificationPending: dispatch.notificationPending,
      created: result.created,
    });
  } catch (error) {
    return actionError(error);
  }
}

export async function lookupPosCustomerAction(
  phone: string,
): Promise<ActionResult<Awaited<ReturnType<typeof lookupPosCustomerByPhone>>>> {
  try {
    return actionSuccess(await lookupPosCustomerByPhone(phone));
  } catch (error) {
    return actionError(error);
  }
}
