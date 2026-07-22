'use client';

import { useState } from 'react';
import {
  acceptOrderAction,
  cancelOrderAction,
  completeOrderAction,
  confirmPaymentAction,
  dispatchOrderAction,
  markOrderReadyAction,
  startOrderPreparationAction,
  undoLastOrderTransitionAction,
  type OrderActionData,
} from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import { Check, CheckCircle2, Package, Truck, UtensilsCrossed } from 'lucide-react';
import type { OrderDetailsDTO } from '@/types/order-query';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2 } from 'lucide-react';
import type { ActionResult } from '@/server/errors';
import type { CancelOrderInput } from '@/features/orders/schemas';
import { CancelOrderDialog } from './cancel-order-dialog';
import { orderQueryKeys } from '@/hooks/use-orders';

interface StatusActionsProps {
  order: OrderDetailsDTO;
  storeId: string;
  authorizationScope: string;
  onOrderChanged?: () => void;
}

type OrderMutation = (input: {
  orderId: string;
  expectedVersion: number;
}) => Promise<ActionResult<OrderActionData>>;

export function StatusActions({ order, storeId, authorizationScope, onOrderChanged }: StatusActionsProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  function refreshOrderData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.details(storeId, authorizationScope, order.id) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.history(storeId, authorizationScope, order.id) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) }),
    ]);
  }

  async function handleMutation(
    mutation: OrderMutation,
    successMessage: string,
    allowUndo = true,
  ) {
    setLoading(true);
    try {
      const result = await mutation({ orderId: order.id, expectedVersion: order.version });
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') {
          await refreshOrderData();
        }
        return false;
      }
      await refreshOrderData();
      if (result.data.notificationPending) {
        toast.warning('Operação concluída. A atualização em tempo real está pendente.');
      }
      toast.success(
        successMessage,
        allowUndo
          ? {
              duration: 10_000,
              action: {
                label: 'Desfazer',
                onClick: () => void handleUndo(result.data.version),
              },
            }
          : undefined,
      );
      onOrderChanged?.();
      return true;
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo(expectedVersion: number) {
    setLoading(true);
    try {
      const result = await undoLastOrderTransitionAction({ orderId: order.id, expectedVersion });
      if (!result.success) {
        toast.error(result.error.message);
        await refreshOrderData();
        return;
      }
      await refreshOrderData();
      toast.success('Alteração desfeita.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPayment() {
    setLoading(true);
    try {
      const result = await confirmPaymentAction({
        orderId: order.id,
        expectedVersion: order.version,
      });
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') {
          await refreshOrderData();
        }
        return false;
      }
      toast.success('Pagamento confirmado.');
      if (result.data.notificationPending) {
        toast.warning('Pagamento salvo. A atualização em tempo real está pendente.');
      }
      await refreshOrderData();
      return true;
    } finally {
      setLoading(false);
    }
  }

  const pixNeedsPayment = order.payment.method === 'PIX' && order.payment.status !== 'PAID';

  async function handleCancel(
    reasonCode: CancelOrderInput['reasonCode'],
    note: string | undefined,
  ) {
    setLoading(true);
    try {
      const result = await cancelOrderAction({
        orderId: order.id,
        expectedVersion: order.version,
        reasonCode,
        note,
      });
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') {
          await refreshOrderData();
        }
        return false;
      }
      await refreshOrderData();
      toast.success('Pedido cancelado.');
      if (result.data.notificationPending) {
        toast.warning('Cancelamento salvo. A atualização em tempo real está pendente.');
      }
      onOrderChanged?.();
      return true;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Payment Action */}
      <div>
        {order.allowedActions.confirmPayment && (
          <ConfirmDialog
            title="Confirmar o pagamento?"
            description="Use esta ação somente depois de verificar o recebimento. O pedido será marcado como pago."
            confirmLabel="Confirmar pagamento"
            onConfirm={handleConfirmPayment}
            trigger={<Button type="button" variant="outline" className="border-success/40 text-success hover:bg-success-light"><CheckCircle2 aria-hidden="true" /> Confirmar pagamento</Button>}
          />
        )}
      </div>

      {/* Status Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {order.allowedActions.accept && (
          <Button 
            onClick={() => handleMutation(acceptOrderAction, 'Pedido aceito.')}
            disabled={loading}
            className="bg-info text-white hover:bg-info/90"
          >
            <Check className="mr-2 h-4 w-4" />
            Aceitar Pedido
          </Button>
        )}
        
        {order.allowedActions.startPreparation && (
          <Button 
            onClick={() => handleMutation(startOrderPreparationAction, 'Preparo iniciado.')}
            disabled={loading}
            className="bg-brand-700 text-white hover:bg-brand-800"
          >
            <UtensilsCrossed className="mr-2 h-4 w-4" />
            Iniciar Preparo
          </Button>
        )}

        {order.allowedActions.markReady && (
          <Button 
            onClick={() => handleMutation(markOrderReadyAction, 'Pedido marcado como pronto.')}
            disabled={loading}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            <Package className="mr-2 h-4 w-4" />
            Marcar como pronto
          </Button>
        )}

        {order.allowedActions.dispatch && (
          <Button
            onClick={() => handleMutation(dispatchOrderAction, 'Pedido despachado.')}
            disabled={loading}
            className="bg-info text-white hover:bg-info/90"
          >
            <Truck className="mr-2 h-4 w-4" />
            Despachar para entrega
          </Button>
        )}

        {order.allowedActions.complete && (
          <ConfirmDialog
            title={`Concluir o pedido ${order.orderNumber}?`}
            description={pixNeedsPayment ? 'Confirme o pagamento Pix antes de concluir o pedido.' : 'Confirme depois que o cliente receber o pedido ou concluir a retirada.'}
            confirmLabel="Concluir pedido"
            onConfirm={() => handleMutation(completeOrderAction, 'Pedido concluído.', false)}
            trigger={(
              <Button type="button" disabled={loading || pixNeedsPayment} className="bg-success text-white hover:bg-success/90">
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Concluir pedido
              </Button>
            )}
          />
        )}

        {order.allowedActions.cancel && (
          <CancelOrderDialog
            orderNumber={order.orderNumber}
            onConfirm={handleCancel}
            trigger={<Button type="button" variant="ghost" disabled={loading} className="text-error hover:bg-error-light hover:text-error">Cancelar pedido</Button>}
          />
        )}
      </div>
      {loading && <span role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="animate-spin" aria-hidden="true" /> Atualizando pedido…</span>}
    </div>
  );
}
