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
  markPaymentFailedAction,
  refundPaymentAction,
  retryFailedPaymentAction,
  undoLastOrderTransitionAction,
  type OrderActionData,
} from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import { Check, CheckCircle2, Package, RotateCcw, Truck, UtensilsCrossed } from 'lucide-react';
import type { OrderDetailsDTO } from '@/types/order-query';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2 } from 'lucide-react';
import type { ActionResult } from '@/server/errors';
import type {
  CancelOrderInput,
  MarkPaymentFailedInput,
  RefundPaymentInput,
} from '@/features/orders/schemas';
import { CancelOrderDialog } from './cancel-order-dialog';
import { orderQueryKeys } from '@/hooks/use-orders';
import { PaymentDecisionDialog } from './payment-decision-dialog';
import { ORDER_ACTION_PRESENTATION } from './order-action-presentation';

interface StatusActionsProps {
  order: OrderDetailsDTO;
  storeId: string;
  authorizationScope: string;
  onOrderChanged?: (orderId: string) => void;
}

type OrderMutation = (input: {
  orderId: string;
  expectedVersion: number;
}) => Promise<ActionResult<OrderActionData>>;

export function StatusActions({
  order,
  storeId,
  authorizationScope,
  onOrderChanged,
}: StatusActionsProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  function refreshOrderData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) }),
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.details(storeId, authorizationScope, order.id),
      }),
      queryClient.invalidateQueries({
        queryKey: orderQueryKeys.history(storeId, authorizationScope, order.id),
      }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) }),
    ]);
  }

  async function handleMutation(mutation: OrderMutation, successMessage: string, allowUndo = true) {
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
      onOrderChanged?.(order.id);
      return true;
    } catch {
      toast.error('Não foi possível atualizar o pedido. Verifique sua conexão e tente novamente.');
      return false;
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
      onOrderChanged?.(order.id);
    } catch {
      toast.error(
        'Não foi possível desfazer a alteração. Verifique sua conexão e tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPayment() {
    return handleFinancialMutation(
      confirmPaymentAction,
      { orderId: order.id, expectedVersion: order.version },
      'Pagamento confirmado.',
    );
  }

  async function handleFinancialMutation(
    mutation: (input: unknown) => Promise<ActionResult<OrderActionData>>,
    input: unknown,
    successMessage: string,
  ) {
    setLoading(true);
    try {
      const result = await mutation(input);
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') {
          await refreshOrderData();
        }
        return false;
      }
      toast.success(successMessage);
      if (result.data.notificationPending) {
        toast.warning('Pagamento salvo. A atualização em tempo real está pendente.');
      }
      await refreshOrderData();
      onOrderChanged?.(order.id);
      return true;
    } catch {
      toast.error(
        'Não foi possível atualizar o pagamento. Verifique sua conexão e tente novamente.',
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  function handlePaymentFailed(
    reasonCode: MarkPaymentFailedInput['reasonCode'],
    note: string | undefined,
  ) {
    return handleFinancialMutation(
      markPaymentFailedAction,
      { orderId: order.id, expectedVersion: order.version, reasonCode, note },
      'Pagamento marcado como não identificado.',
    );
  }

  function handleRefund(reasonCode: RefundPaymentInput['reasonCode'], note: string | undefined) {
    return handleFinancialMutation(
      refundPaymentAction,
      { orderId: order.id, expectedVersion: order.version, reasonCode, note },
      'Reembolso integral registrado.',
    );
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
      onOrderChanged?.(order.id);
      return true;
    } catch {
      toast.error('Não foi possível cancelar o pedido. Verifique sua conexão e tente novamente.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Payment Action */}
      <div className="order-2 flex flex-wrap items-center gap-2 [&_button]:w-full sm:[&_button]:w-auto">
        {order.allowedActions.confirmPayment && (
          <ConfirmDialog
            title="Confirmar o pagamento?"
            description="Use esta ação somente depois de verificar o recebimento. O pedido será marcado como pago."
            confirmLabel="Confirmar pagamento"
            onConfirm={handleConfirmPayment}
            trigger={
              <Button
                type="button"
                disabled={loading}
                className={ORDER_ACTION_PRESENTATION.CONFIRM_PAYMENT.className}
              >
                <CheckCircle2 aria-hidden="true" />
                {ORDER_ACTION_PRESENTATION.CONFIRM_PAYMENT.label}
              </Button>
            }
          />
        )}
        {order.allowedActions.markPaymentFailed && (
          <PaymentDecisionDialog
            kind="failure"
            orderNumber={order.orderNumber}
            total={order.totals.total}
            onConfirm={handlePaymentFailed}
            trigger={
              <Button type="button" variant="outline" className="text-error" disabled={loading}>
                Pagamento não identificado
              </Button>
            }
          />
        )}
        {order.allowedActions.retryPayment && (
          <ConfirmDialog
            title="Reabrir análise do pagamento?"
            description="O pagamento voltará a ficar pendente para uma nova análise."
            confirmLabel="Reabrir análise"
            onConfirm={() =>
              handleFinancialMutation(
                retryFailedPaymentAction,
                { orderId: order.id, expectedVersion: order.version },
                'Pagamento reaberto para análise.',
              )
            }
            trigger={
              <Button type="button" variant="outline" disabled={loading}>
                <RotateCcw aria-hidden="true" /> Reabrir pagamento
              </Button>
            }
          />
        )}
        {order.allowedActions.refundPayment && (
          <PaymentDecisionDialog
            kind="refund"
            orderNumber={order.orderNumber}
            total={order.payment.amount ?? order.totals.total}
            onConfirm={handleRefund}
            trigger={
              <Button type="button" variant="outline" className="text-error" disabled={loading}>
                Registrar reembolso
              </Button>
            }
          />
        )}
      </div>

      {/* Status Actions */}
      <div className="order-1 flex flex-wrap items-center gap-2 [&_button]:w-full sm:[&_button]:w-auto">
        {order.allowedActions.accept && (
          <Button
            onClick={() => handleMutation(acceptOrderAction, 'Pedido aceito.')}
            disabled={loading}
            className={ORDER_ACTION_PRESENTATION.CONFIRM_ORDER.className}
          >
            <Check className="mr-2 h-4 w-4" />
            {ORDER_ACTION_PRESENTATION.CONFIRM_ORDER.label}
          </Button>
        )}

        {order.allowedActions.startPreparation && (
          <Button
            onClick={() => handleMutation(startOrderPreparationAction, 'Preparo iniciado.')}
            disabled={loading}
            className={ORDER_ACTION_PRESENTATION.START_PREPARATION.className}
          >
            <UtensilsCrossed className="mr-2 h-4 w-4" />
            {ORDER_ACTION_PRESENTATION.START_PREPARATION.label}
          </Button>
        )}

        {order.allowedActions.markReady && (
          <Button
            onClick={() => handleMutation(markOrderReadyAction, 'Pedido marcado como pronto.')}
            disabled={loading}
            className={ORDER_ACTION_PRESENTATION.MARK_ORDER_READY.className}
          >
            <Package className="mr-2 h-4 w-4" />
            {ORDER_ACTION_PRESENTATION.MARK_ORDER_READY.label}
          </Button>
        )}

        {order.allowedActions.dispatch && (
          <Button
            onClick={() => handleMutation(dispatchOrderAction, 'Pedido despachado.')}
            disabled={loading}
            className={ORDER_ACTION_PRESENTATION.DISPATCH_FOR_DELIVERY.className}
          >
            <Truck className="mr-2 h-4 w-4" />
            {ORDER_ACTION_PRESENTATION.DISPATCH_FOR_DELIVERY.label}
          </Button>
        )}

        {order.allowedActions.complete && (
          <ConfirmDialog
            title={`Concluir o pedido ${order.orderNumber}?`}
            description={
              pixNeedsPayment
                ? 'Confirme o pagamento Pix antes de concluir o pedido.'
                : 'Confirme depois que o cliente receber o pedido ou concluir a retirada.'
            }
            confirmLabel="Concluir pedido"
            onConfirm={() => handleMutation(completeOrderAction, 'Pedido concluído.', false)}
            trigger={
              <Button
                type="button"
                disabled={loading || pixNeedsPayment}
                className={
                  order.modality === 'PICKUP'
                    ? ORDER_ACTION_PRESENTATION.COMPLETE_PICKUP.className
                    : ORDER_ACTION_PRESENTATION.COMPLETE_DELIVERY.className
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {order.modality === 'PICKUP'
                  ? ORDER_ACTION_PRESENTATION.COMPLETE_PICKUP.label
                  : ORDER_ACTION_PRESENTATION.COMPLETE_DELIVERY.label}
              </Button>
            }
          />
        )}

        {order.allowedActions.cancel && (
          <CancelOrderDialog
            orderNumber={order.orderNumber}
            onConfirm={handleCancel}
            trigger={
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                className="text-error hover:bg-error-light hover:text-error"
              >
                Cancelar pedido
              </Button>
            }
          />
        )}
      </div>
      {loading && (
        <span
          role="status"
          className="text-text-secondary order-3 inline-flex items-center gap-2 text-sm"
        >
          <Loader2 className="animate-spin" aria-hidden="true" /> Atualizando pedido…
        </span>
      )}
    </div>
  );
}
