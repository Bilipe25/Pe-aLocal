'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  acceptOrderAction,
  completeOrderAction,
  confirmPaymentAction,
  dispatchOrderAction,
  markOrderReadyAction,
  startOrderPreparationAction,
  undoLastOrderTransitionAction,
  type OrderActionData,
} from '@/features/orders/admin-actions';
import { invalidateOperationalOrderData } from '@/lib/query/invalidation';
import {
  getNextOperationalAction,
  type OrderOperationalAction,
} from '@/domain/orders/order-workflow';
import type { OrderQueueItemDTO } from '@/types/order-query';
import type { ActionResult } from '@/server/errors';
import { ORDER_ACTION_PRESENTATION } from './order-action-presentation';

type OrderMutation = (input: {
  orderId: string;
  expectedVersion: number;
}) => Promise<ActionResult<OrderActionData>>;

const ACTIONS: Partial<Record<OrderOperationalAction, OrderMutation>> = {
  CONFIRM_ORDER: acceptOrderAction,
  START_PREPARATION: startOrderPreparationAction,
  MARK_ORDER_READY: markOrderReadyAction,
  DISPATCH_FOR_DELIVERY: dispatchOrderAction,
  COMPLETE_PICKUP: completeOrderAction,
  COMPLETE_DINE_IN: completeOrderAction,
  COMPLETE_DELIVERY: completeOrderAction,
  CONFIRM_PAYMENT: confirmPaymentAction,
};

function needsConfirmation(action: OrderOperationalAction) {
  return ['COMPLETE_PICKUP', 'COMPLETE_DINE_IN', 'COMPLETE_DELIVERY', 'CONFIRM_PAYMENT'].includes(
    action,
  );
}

export function OrderCardPrimaryAction({
  order,
  storeId,
  onChanged,
  onOrderChanged,
}: {
  order: OrderQueueItemDTO;
  storeId: string;
  authorizationScope: string;
  onChanged?: () => void;
  onOrderChanged?: (orderId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const action = order.nextActionLabel
    ? getNextOperationalAction({
        status: order.status,
        modality: order.modality,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      })
    : null;
  const mutation = action ? ACTIONS[action] : null;

  async function refresh() {
    await invalidateOperationalOrderData(queryClient, { storeId, orderId: order.id });
  }

  async function undo(expectedVersion: number) {
    try {
      const result = await undoLastOrderTransitionAction({ orderId: order.id, expectedVersion });
      if (!result.success) {
        toast.error(result.error.message);
        await refresh();
        return;
      }
      await refresh();
      onOrderChanged?.(order.id);
      toast.success('Alteração desfeita.');
    } catch {
      toast.error(
        'Não foi possível desfazer a alteração. Verifique sua conexão e tente novamente.',
      );
    }
  }

  async function execute() {
    if (!mutation || !action) return false;
    setLoading(true);
    try {
      const result = await mutation({ orderId: order.id, expectedVersion: order.version });
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') await refresh();
        return false;
      }
      await refresh();
      if (result.data.notificationPending) {
        toast.warning('Pedido atualizado. A notificação em tempo real está pendente.');
      }
      toast.success(
        `${order.nextActionLabel} concluído.`,
        action === 'COMPLETE_PICKUP' ||
          action === 'COMPLETE_DINE_IN' ||
          action === 'COMPLETE_DELIVERY' ||
          action === 'CONFIRM_PAYMENT'
          ? undefined
          : {
              duration: 10_000,
              action: { label: 'Desfazer', onClick: () => void undo(result.data.version) },
            },
      );
      onOrderChanged?.(order.id);
      onChanged?.();
      return true;
    } catch {
      toast.error('Não foi possível atualizar o pedido. Verifique sua conexão e tente novamente.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  if (!action || !mutation || !order.nextActionLabel) return null;
  const presentation = ORDER_ACTION_PRESENTATION[action];

  const button = (
    <Button
      type="button"
      size="sm"
      disabled={loading}
      onClick={needsConfirmation(action) ? undefined : () => void execute()}
      className={`min-h-11 flex-1 text-sm ${presentation.className}`}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {loading ? 'Atualizando…' : presentation.label}
    </Button>
  );

  if (!needsConfirmation(action)) return button;

  return (
    <ConfirmDialog
      title={action === 'CONFIRM_PAYMENT' ? 'Confirmar o pagamento?' : 'Concluir este pedido?'}
      description={
        action === 'CONFIRM_PAYMENT'
          ? 'Confirme somente depois de verificar o recebimento do valor.'
          : 'Confirme somente depois da entrega ou retirada pelo cliente.'
      }
      confirmLabel={action === 'CONFIRM_PAYMENT' ? 'Confirmar pagamento' : 'Concluir pedido'}
      onConfirm={execute}
      trigger={button}
    />
  );
}
