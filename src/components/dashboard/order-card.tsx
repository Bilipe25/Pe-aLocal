'use client';

import { useState, useEffect } from 'react';

import { Clock, MapPin, Receipt, CheckCircle2, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import type { OrderWithDetails } from '@/types/order';
import type { LucideIcon } from 'lucide-react';

export const statusMap: Record<OrderStatus, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Novo', color: 'bg-error/10 text-error', icon: Clock },
  AWAITING_PAYMENT: { label: 'Aguard. Pag.', color: 'bg-yellow-500/10 text-yellow-600', icon: Receipt },
  CONFIRMED: { label: 'Confirmado', color: 'bg-blue-500/10 text-blue-600', icon: CheckCircle2 },
  PREPARING: { label: 'Preparando', color: 'bg-purple-500/10 text-purple-600', icon: Package },
  READY: { label: 'Pronto', color: 'bg-brand-500/10 text-brand-600', icon: CheckCircle2 },
  OUT_FOR_DELIVERY: { label: 'Saiu p/ Entrega', color: 'bg-brand-500/10 text-brand-600', icon: Package },
  DELIVERED: { label: 'Concluído', color: 'bg-surface-tertiary text-text-secondary', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-error/10 text-error opacity-50', icon: Clock },
};

export const paymentStatusMap: Record<PaymentStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-yellow-500/10 text-yellow-600' },
  PAID: { label: 'Pago', color: 'bg-brand-500/10 text-brand-600' },
  FAILED: { label: 'Falhou', color: 'bg-error/10 text-error' },
  REFUNDED: { label: 'Reembolsado', color: 'bg-surface-tertiary text-text-secondary' },
  CANCELLED: { label: 'Cancelado', color: 'bg-error/10 text-error' },
  CUSTOMER_REPORTED_PAID: { label: 'Pag. Informado', color: 'bg-blue-500/10 text-blue-600' },
};

export function OrderCard({ order, onClick }: { order: OrderWithDetails; onClick: () => void }) {
  const statusInfo = statusMap[order.status as OrderStatus];
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];
  const StatusIcon = statusInfo.icon;
  
  const [timeAgo, setTimeAgo] = useState(() => Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [order.createdAt]);

  const timeText = timeAgo < 1 ? 'Agora' : `${timeAgo}m atrás`;

  return (
    <div 
      onClick={onClick}
      className={`cursor-pointer rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-brand-300 hover:shadow-md ${
        order.status === 'PENDING' ? 'ring-2 ring-error/50' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-mono text-sm font-bold text-text-primary">
            #{order.orderNumber}
          </span>
          <span className="ml-2 text-xs text-text-secondary">{timeText}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
          <StatusIcon className="h-3 w-3" />
          {statusInfo.label}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm font-medium text-text-primary">
          {order.customerName}
        </p>
        <p className="text-xs text-text-secondary line-clamp-1">
          {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} • {formatCurrency(order.total)}
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <MapPin className="h-3.5 w-3.5" />
          {order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Receipt className="h-3.5 w-3.5" />
          <span className={`px-1.5 py-0.5 rounded-sm ${paymentInfo.color}`}>
            {order.paymentMethod === 'PIX' ? 'Pix' : order.paymentMethod === 'CASH' ? 'Dinheiro' : 'Cartão'} ({paymentInfo.label})
          </span>
        </div>
      </div>
    </div>
  );
}
