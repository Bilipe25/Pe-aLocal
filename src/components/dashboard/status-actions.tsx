'use client';

import { useState } from 'react';
import { updateOrderStatusAction, confirmPaymentAction } from '@/features/orders/admin-actions';
import { Button } from '@/components/ui/button';
import type { OrderStatus } from '@prisma/client';
import { Check, CheckCircle2, Package, Truck, UtensilsCrossed } from 'lucide-react';
import type { OrderWithDetails } from '@/types/order';

export function StatusActions({ order }: { order: OrderWithDetails }) {
  const [loading, setLoading] = useState(false);

  async function handleStatusChange(newStatus: OrderStatus) {
    setLoading(true);
    try {
      await updateOrderStatusAction(order.id, newStatus);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPayment() {
    setLoading(true);
    try {
      await confirmPaymentAction(order.id);
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
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleConfirmPayment}
            disabled={loading}
            className="border-green-500 text-green-600 hover:bg-green-50"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirmar Pagamento
          </Button>
        )}
      </div>

      {/* Status Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {order.status === 'PENDING' && (
          <Button 
            onClick={() => handleStatusChange('CONFIRMED')}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="mr-2 h-4 w-4" />
            Aceitar Pedido
          </Button>
        )}
        
        {order.status === 'CONFIRMED' && (
          <Button 
            onClick={() => handleStatusChange('PREPARING')}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
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
          <Button 
            onClick={() => handleStatusChange('DELIVERED')}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Concluir Pedido
          </Button>
        )}

        {/* Cancel button only if not delivered/cancelled */}
        {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && (
          <Button 
            variant="ghost" 
            onClick={() => {
              if(window.confirm('Tem certeza que deseja cancelar este pedido?')) {
                handleStatusChange('CANCELLED');
              }
            }}
            disabled={loading}
            className="text-error hover:bg-error/10 hover:text-error"
          >
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
