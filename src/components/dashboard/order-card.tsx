'use client';

import { Clock, MapPin, Receipt, CheckCircle2, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import type { OrderWithDetails } from '@/types/order';
import type { LucideIcon } from 'lucide-react';

export const statusMap: Record<OrderStatus, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Novo', color: 'bg-warning-light text-warning', icon: Clock },
  AWAITING_PAYMENT: { label: 'Aguardando pagamento', color: 'bg-warning-light text-warning', icon: Receipt },
  CONFIRMED: { label: 'Confirmado', color: 'bg-info-light text-info', icon: CheckCircle2 },
  PREPARING: { label: 'Em preparo', color: 'bg-brand-50 text-brand-700', icon: Package },
  READY: { label: 'Pronto', color: 'bg-success-light text-success', icon: CheckCircle2 },
  OUT_FOR_DELIVERY: { label: 'Em entrega', color: 'bg-info-light text-info', icon: Package },
  DELIVERED: { label: 'Concluído', color: 'bg-surface-tertiary text-text-secondary', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', color: 'bg-error-light text-error', icon: Clock },
};

export const paymentStatusMap: Record<PaymentStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pendente', color: 'bg-warning-light text-warning' },
  PAID: { label: 'Pago', color: 'bg-success-light text-success' },
  FAILED: { label: 'Falhou', color: 'bg-error-light text-error' },
  REFUNDED: { label: 'Reembolsado', color: 'bg-surface-tertiary text-text-secondary' },
  CANCELLED: { label: 'Cancelado', color: 'bg-error-light text-error' },
  CUSTOMER_REPORTED_PAID: { label: 'Pagamento informado', color: 'bg-info-light text-info' },
};

export function OrderCard({ order, onClick, now, selected = false }: { order: OrderWithDetails; onClick: () => void; now: number; selected?: boolean }) {
  const statusInfo = statusMap[order.status as OrderStatus];
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];
  const StatusIcon = statusInfo.icon;
  
  const timeAgo = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
  const timeText = timeAgo < 1 ? 'Agora' : timeAgo < 60 ? `Há ${timeAgo} min` : `Há ${Math.floor(timeAgo / 60)} h`;
  const needsAttention = order.status === 'PENDING' && timeAgo >= 10;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Abrir pedido ${order.orderNumber}, ${statusInfo.label}, ${formatCurrency(order.total)}`}
      className={`w-full rounded-xl border bg-surface p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30 ${
        selected ? 'border-brand-500 ring-2 ring-brand-500/20' : needsAttention ? 'border-warning/50' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="font-mono text-sm font-bold text-text-primary">
            #{order.orderNumber}
          </span>
          <span className={needsAttention ? 'ml-2 text-xs font-semibold text-warning' : 'ml-2 text-xs text-text-secondary'}>
            {needsAttention ? `Aguardando ${timeText.toLowerCase().replace('há ', '')}` : timeText}
          </span>
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
    </button>
  );
}
