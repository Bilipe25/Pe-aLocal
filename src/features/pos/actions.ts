'use server';

import { triggerOrderUpdated, triggerPaymentUpdated } from '@/lib/pusher/server';
import {
  mutatePosDraftSchema,
  mutatePosTerminalSchema,
  deletePosShortcutSchema,
  posOrderSchema,
  posQuoteSchema,
  posShortcutSchema,
  posTerminalSchema,
  reorderPosShortcutsSchema,
  savePosDraftSchema,
} from '@/schemas/pos';
import { actionError, actionSuccess, CheckoutError, type ActionResult } from '@/server/errors';
import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';
import {
  calculatePosQuote,
  createPosOrder,
  lookupPosCustomerByPhone,
} from '@/server/services/pos-order.service';
import {
  discardPosDraft,
  listOpenPosDrafts,
  resumePosDraft,
  savePosDraft,
} from '@/server/services/pos-draft.service';
import {
  createPosShortcut,
  deactivatePosTerminal,
  deletePosShortcut,
  getPosOperationalOverview,
  reorderPosShortcuts,
  repeatPosOrder,
  savePosTerminal,
} from '@/server/services/pos-operations.service';

function invalidPosInput(message: string, issues: Array<{ path: PropertyKey[]; message: string }>) {
  return new CheckoutError(
    'CART_INVALID',
    message,
    422,
    issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  );
}

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

export async function savePosDraftAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof savePosDraft>>>> {
  try {
    const parsed = savePosDraftSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw invalidPosInput('Revise os dados do pedido em espera.', parsed.error.issues);
    }
    const result = await savePosDraft(parsed.data);
    console.info('[POS_DRAFT_HELD]', { draftId: result.id, version: result.version });
    return actionSuccess(result);
  } catch (error) {
    return actionError(error);
  }
}

export async function listOpenPosDraftsAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof listOpenPosDrafts>>>
> {
  try {
    return actionSuccess(await listOpenPosDrafts());
  } catch (error) {
    return actionError(error);
  }
}

export async function resumePosDraftAction(
  draftId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof resumePosDraft>>>> {
  try {
    const parsed = mutatePosDraftSchema.shape.draftId.safeParse(draftId);
    if (!parsed.success) throw invalidPosInput('Pedido em espera inválido.', parsed.error.issues);
    return actionSuccess(await resumePosDraft(parsed.data));
  } catch (error) {
    return actionError(error);
  }
}

export async function discardPosDraftAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof discardPosDraft>>>> {
  try {
    const parsed = mutatePosDraftSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw invalidPosInput('Pedido em espera inválido.', parsed.error.issues);
    }
    return actionSuccess(await discardPosDraft(parsed.data.draftId, parsed.data.expectedVersion));
  } catch (error) {
    return actionError(error);
  }
}

export async function getPosOperationalOverviewAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof getPosOperationalOverview>>>
> {
  try {
    return actionSuccess(await getPosOperationalOverview());
  } catch (error) {
    return actionError(error);
  }
}

export async function savePosTerminalAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof savePosTerminal>>>> {
  try {
    const parsed = posTerminalSchema.safeParse(rawInput);
    if (!parsed.success) throw invalidPosInput('Revise o terminal.', parsed.error.issues);
    return actionSuccess(await savePosTerminal(parsed.data));
  } catch (error) {
    return actionError(error);
  }
}

export async function deactivatePosTerminalAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof deactivatePosTerminal>>>> {
  try {
    const parsed = mutatePosTerminalSchema.safeParse(rawInput);
    if (!parsed.success) throw invalidPosInput('Terminal inválido.', parsed.error.issues);
    return actionSuccess(await deactivatePosTerminal(parsed.data.id, parsed.data.expectedVersion));
  } catch (error) {
    return actionError(error);
  }
}

export async function createPosShortcutAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof createPosShortcut>>>> {
  try {
    const parsed = posShortcutSchema.safeParse(rawInput);
    if (!parsed.success) throw invalidPosInput('Revise o produto rápido.', parsed.error.issues);
    return actionSuccess(await createPosShortcut(parsed.data));
  } catch (error) {
    return actionError(error);
  }
}

export async function deletePosShortcutAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof deletePosShortcut>>>> {
  try {
    const parsed = deletePosShortcutSchema.safeParse(rawInput);
    if (!parsed.success) throw invalidPosInput('Produto rápido inválido.', parsed.error.issues);
    return actionSuccess(await deletePosShortcut(parsed.data.id));
  } catch (error) {
    return actionError(error);
  }
}

export async function reorderPosShortcutsAction(
  rawInput: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof reorderPosShortcuts>>>> {
  try {
    const parsed = reorderPosShortcutsSchema.safeParse(rawInput);
    if (!parsed.success) throw invalidPosInput('Ordem inválida.', parsed.error.issues);
    return actionSuccess(await reorderPosShortcuts(parsed.data.shortcutIds));
  } catch (error) {
    return actionError(error);
  }
}

export async function repeatPosOrderAction(
  orderId: string,
): Promise<ActionResult<Awaited<ReturnType<typeof repeatPosOrder>>>> {
  try {
    const parsed = deletePosShortcutSchema.shape.id.safeParse(orderId);
    if (!parsed.success) throw invalidPosInput('Pedido inválido.', parsed.error.issues);
    return actionSuccess(await repeatPosOrder(parsed.data));
  } catch (error) {
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
