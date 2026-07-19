'use client';

import { useState } from 'react';
import { updateOrderStatusAction, confirmPaymentAction, undoOrderStatusAction } from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import type { OrderStatus } from '@prisma/client';
import { Check, CheckCircle2, Package, Truck, UtensilsCrossed } from 'lucide-react';
import type { OrderWithDetails } from '@/types/order';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2 } from 'lucide-react';

export function StatusActions({ order, onOrderChanged }: { order: OrderWithDetails; onOrderChanged?: () => void }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function handleStatusChange(newStatus: OrderStatus) {
    const previousStatus = order.status;
    setLoading(true);
    try {
      const result = await updateOrderStatusAction(order.id, newStatus);
      if (!result.success) {
        toast.error(result.error.message);
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Status do pedido atualizado.', {
        duration: 10_000,
        action: {
          label: 'Desfazer',
          onClick: () => void handleUndo(newStatus, previousStatus),
        },
      });
      onOrderChanged?.();
      return true;
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo(expectedCurrentStatus: OrderStatus, previousStatus: OrderStatus) {
    setLoading(true);
    try {
      const result = await undoOrderStatusAction(order.id, expectedCurrentStatus, previousStatus);
      if (!result.success) {
        toast.error(result.error.message);
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
      const result = await confirmPaymentAction(order.id);
      if (!result.success) {
        toast.error(result.error.message);
        return false;
      }
      toast.success('Pagamento confirmado.');
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      return true;
    } finally {
      setLoading(false);
    }
  }

  const isDelivery = order.modality === 'DELIVERY';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Payment Action */}
      <div>
        {order.paymentStatus === 'PENDING' && (
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
        {order.status === 'PENDING' && (
          <Button 
            onClick={() => handleStatusChange('CONFIRMED')}
            disabled={loading}
            className="bg-info text-white hover:bg-info/90"
          >
            <Check className="mr-2 h-4 w-4" />
            Aceitar Pedido
          </Button>
        )}
        
        {order.status === 'CONFIRMED' && (
          <Button 
            onClick={() => handleStatusChange('PREPARING')}
            disabled={loading}
            className="bg-brand-700 text-white hover:bg-brand-800"
          >
            <UtensilsCrossed className="mr-2 h-4 w-4" />
            Iniciar Preparo
          </Button>
        )}

        {order.status === 'PREPARING' && (
          <Button 
            onClick={() => handleStatusChange(isDelivery ? 'OUT_FOR_DELIVERY' : 'READY')}
            disabled={loading}
            className="bg-brand-600 hover:bg-brand-700 text-white"
          >
            {isDelivery ? <Truck className="mr-2 h-4 w-4" /> : <Package className="mr-2 h-4 w-4" />}
            {isDelivery ? 'Despachar para Entrega' : 'Pronto para Retirada'}
          </Button>
        )}

        {(order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') && (
          <ConfirmDialog
            title={`Concluir o pedido ${order.orderNumber}?`}
            description="Confirme depois que o cliente receber o pedido ou concluir a retirada. Você poderá desfazer por alguns segundos."
            confirmLabel="Concluir pedido"
            onConfirm={() => handleStatusChange('DELIVERED')}
            trigger={(
              <Button type="button" disabled={loading} className="bg-success text-white hover:bg-success/90">
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Concluir pedido
              </Button>
            )}
          />
        )}

        {/* Cancel button only if not delivered/cancelled */}
        {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
          <ConfirmDialog
            title={`Cancelar o pedido ${order.orderNumber}?`}
            description="O pedido será encerrado como cancelado. Confirme somente depois de alinhar com o cliente."
            confirmLabel="Cancelar pedido"
            destructive
            onConfirm={() => handleStatusChange('CANCELLED')}
            trigger={<Button type="button" variant="ghost" disabled={loading} className="text-error hover:bg-error-light hover:text-error">Cancelar pedido</Button>}
          />
        )}
      </div>
      {loading && <span role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary"><Loader2 className="animate-spin" aria-hidden="true" /> Atualizando pedido…</span>}
    </div>
  );
}
