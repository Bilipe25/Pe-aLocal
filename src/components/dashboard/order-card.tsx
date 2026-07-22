'use client';

import {
  ArrowRight,
  Clock,
  MapPin,
  Receipt,
  CheckCircle2,
  Package,
  TriangleAlert,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import type { OrderQueueItemDTO } from '@/types/order-query';
import type { LucideIcon } from 'lucide-react';

export const statusMap: Record<OrderStatus, { label: string; color: string; icon: LucideIcon }> = {
  PENDING: { label: 'Novo', color: 'bg-warning-light text-warning', icon: Clock },
  AWAITING_PAYMENT: {
    label: 'Aguardando pagamento',
    color: 'bg-warning-light text-warning',
    icon: Receipt,
  },
  CONFIRMED: { label: 'Confirmado', color: 'bg-info-light text-info', icon: CheckCircle2 },
  PREPARING: { label: 'Em preparo', color: 'bg-brand-50 text-brand-700', icon: Package },
  READY: { label: 'Pronto', color: 'bg-success-light text-success', icon: CheckCircle2 },
  OUT_FOR_DELIVERY: { label: 'Em entrega', color: 'bg-info-light text-info', icon: Package },
  DELIVERED: {
    label: 'Concluído',
    color: 'bg-surface-tertiary text-text-secondary',
    icon: CheckCircle2,
  },
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

export function OrderCard({
  order,
  onClick,
  now,
  selected = false,
}: {
  order: OrderQueueItemDTO;
  onClick: () => void;
  now: number;
  selected?: boolean;
}) {
  const statusInfo = statusMap[order.status as OrderStatus];
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];
  const StatusIcon = statusInfo.icon;

  const timeAgo = Math.max(0, Math.floor((now - new Date(order.stageStartedAt).getTime()) / 60000));
  const timeText =
    timeAgo < 1 ? 'Agora' : timeAgo < 60 ? `Há ${timeAgo} min` : `Há ${Math.floor(timeAgo / 60)} h`;
  const primaryAlert = order.stageAlerts[0];
  const needsAttention = order.hasOperationalAlert;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Abrir pedido ${order.orderNumber}, ${statusInfo.label}, ${formatCurrency(order.total)}`}
      className={`bg-surface hover:border-brand-300 hover:bg-brand-50/30 w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-brand-500 ring-brand-500/20 ring-2'
          : needsAttention
            ? 'border-warning/50'
            : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <span className="text-text-primary font-mono text-sm font-bold">
            #{order.orderNumber}
          </span>
          <span
            className={
              needsAttention
                ? 'text-warning ml-2 text-xs font-semibold'
                : 'text-text-secondary ml-2 text-xs'
            }
          >
            {order.stageLabel} · {timeText.toLowerCase()}
          </span>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}
        >
          <StatusIcon className="h-3 w-3" />
          {statusInfo.label}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-text-primary text-sm font-medium">{order.customerDisplayName}</p>
        <p className="text-text-secondary line-clamp-1 text-xs">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'} •{' '}
          {formatCurrency(order.total)}
        </p>
      </div>

      {primaryAlert && (
        <div
          className={
            primaryAlert.severity === 'critical'
              ? 'bg-error-light text-error mb-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold'
              : 'bg-warning-light text-warning mb-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold'
          }
        >
          <TriangleAlert className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{primaryAlert.label}</span>
        </div>
      )}

      <div className="border-border flex items-center gap-3 border-t pt-3">
        <div className="text-text-secondary flex items-center gap-1.5 text-xs">
          <MapPin className="h-3.5 w-3.5" />
          {order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        </div>
        <div className="text-text-secondary flex items-center gap-1.5 text-xs">
          <Receipt className="h-3.5 w-3.5" />
          <span className={`rounded-sm px-1.5 py-0.5 ${paymentInfo.color}`}>
            {order.paymentMethod === 'PIX'
              ? 'Pix'
              : order.paymentMethod === 'CASH'
                ? 'Dinheiro'
                : 'Cartão'}{' '}
            ({paymentInfo.label})
          </span>
        </div>
      </div>
      {order.nextActionLabel && (
        <div className="text-brand-700 mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold">
          {order.nextActionLabel} <ArrowRight aria-hidden="true" />
        </div>
      )}
    </button>
  );
}
