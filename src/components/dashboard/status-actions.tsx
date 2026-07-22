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
import type { OrderWithDetails } from '@/types/order';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2 } from 'lucide-react';
import type { ActionResult } from '@/server/errors';
import type { OrderCapabilities } from '@/features/orders/capabilities';
import type { CancelOrderInput } from '@/features/orders/schemas';
import { CancelOrderDialog } from './cancel-order-dialog';

interface StatusActionsProps {
  order: OrderWithDetails;
  capabilities: OrderCapabilities;
  onOrderChanged?: () => void;
}

type OrderMutation = (input: {
  orderId: string;
  expectedVersion: number;
}) => Promise<ActionResult<OrderActionData>>;

export function StatusActions({ order, capabilities, onOrderChanged }: StatusActionsProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

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
          await queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
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
        await queryClient.invalidateQueries({ queryKey: ['orders'] });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
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
          await queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
        return false;
      }
      toast.success('Pagamento confirmado.');
      if (result.data.notificationPending) {
        toast.warning('Pagamento salvo. A atualização em tempo real está pendente.');
      }
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      return true;
    } finally {
      setLoading(false);
    }
  }

  const isDelivery = order.modality === 'DELIVERY';
  const pixNeedsPayment = order.paymentMethod === 'PIX' && order.paymentStatus !== 'PAID';

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
          await queryClient.invalidateQueries({ queryKey: ['orders'] });
        }
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
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
        {capabilities.canConfirmPayment &&
          (order.paymentStatus === 'PENDING' ||
            order.paymentStatus === 'CUSTOMER_REPORTED_PAID') && (
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
        {capabilities.canAcceptOrder && order.status === 'PENDING' && (
          <Button 
            onClick={() => handleMutation(acceptOrderAction, 'Pedido aceito.')}
            disabled={loading}
            className="bg-info text-white hover:bg-info/90"
          >
            <Check className="mr-2 h-4 w-4" />
            Aceitar Pedido
          </Button>
        )}
        
        {capabilities.canStartPreparation && order.status === 'CONFIRMED' && (
          <Button 
            onClick={() => handleMutation(startOrderPreparationAction, 'Preparo iniciado.')}
            disabled={loading}
            className="bg-brand-700 text-white hover:bg-brand-800"
          >
            <UtensilsCrossed className="mr-2 h-4 w-4" />
            Iniciar Preparo
          </Button>
        )}

        {capabilities.canMarkReady && order.status === 'PREPARING' && (
          <Button 
            onClick={() => handleMutation(markOrderReadyAction, 'Pedido marcado como pronto.')}
            disabled={loading}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            <Package className="mr-2 h-4 w-4" />
            Marcar como pronto
          </Button>
        )}

        {capabilities.canDispatch && order.status === 'READY' && isDelivery && (
          <Button
            onClick={() => handleMutation(dispatchOrderAction, 'Pedido despachado.')}
            disabled={loading}
            className="bg-info text-white hover:bg-info/90"
          >
            <Truck className="mr-2 h-4 w-4" />
            Despachar para entrega
          </Button>
        )}

        {capabilities.canComplete &&
          ((order.status === 'READY' && !isDelivery) || order.status === 'OUT_FOR_DELIVERY') && (
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

        {capabilities.canCancel && order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
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
