'use client';

import type { OrderStatus, PaymentStatus } from '@prisma/client';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  MessageSquareText,
  Package,
  Receipt,
  TriangleAlert,
} from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  formatElapsedMinutes,
  formatPromisedFulfillment,
  formatSlaAlertLabel,
} from '@/domain/orders/order-time';
import { formatCurrency } from '@/lib/utils';
import type {
  OrderBoardItemDTO,
  OrderOperationalAlertDTO,
  OrderQueueItemDTO,
} from '@/types/order-query';

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

/**
 * The extra fields are optional so the card remains compatible with the old queue endpoint
 * while the board endpoint is rolled out.
 */
export type OrderCardData = OrderQueueItemDTO &
  Partial<
    Pick<OrderBoardItemDTO, 'itemPreview' | 'promisedFulfillmentMinAt' | 'promisedFulfillmentMaxAt'>
  >;

export interface OrderCardProps {
  order: OrderCardData;
  onClick: () => void;
  selected?: boolean;
  timeZone?: string;
  /** A real status-transition control supplied by the board. */
  footer?: ReactNode;
}

const ACCEPTANCE_ALERT_MINUTES = 3;
const CONFIRMED_ALERT_MINUTES = 5;
const READY_PICKUP_ALERT_MINUTES = 15;
const READY_DISPATCH_ALERT_MINUTES = 5;
const PAYMENT_ALERT_MINUTES = 10;

function elapsedMinutesAt(now: number, startedAt: string, fallback = 0) {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs) || now <= 0) return fallback;
  return Math.max(0, Math.floor((now - startedAtMs) / 60_000));
}

function liveAlert(
  code: OrderOperationalAlertDTO['code'],
  label: string,
  elapsedMinutes: number,
  threshold: number,
): OrderOperationalAlertDTO {
  return {
    code,
    label,
    severity: elapsedMinutes >= threshold * 2 ? 'critical' : 'warning',
  };
}

/**
 * Keeps alerts fresh between board refetches. Store-dependent thresholds are calculated on the
 * server and serialized with the card; the browser only advances the elapsed clock.
 */
export function deriveLiveStageAlerts(order: OrderCardData, now: number) {
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') return [];

  const stageElapsed = elapsedMinutesAt(now, order.stageStartedAt, order.stageElapsedMinutes ?? 0);
  const orderElapsed = elapsedMinutesAt(now, order.createdAt, order.stageElapsedMinutes ?? 0);
  const alerts: OrderOperationalAlertDTO[] = [];
  const configuredStageThreshold = order.stageAlertThresholdMinutes;

  if (order.paymentStatus === 'CUSTOMER_REPORTED_PAID') {
    alerts.push({
      code: 'PAYMENT_REVIEW_REQUIRED',
      label: 'Cliente informou o pagamento',
      severity: 'warning',
    });
  } else if (
    order.paymentMethod === 'PIX' &&
    order.paymentStatus === 'PENDING' &&
    orderElapsed >= PAYMENT_ALERT_MINUTES
  ) {
    alerts.push(
      liveAlert(
        'PAYMENT_OVERDUE',
        formatSlaAlertLabel('Pix', orderElapsed, PAYMENT_ALERT_MINUTES),
        orderElapsed,
        PAYMENT_ALERT_MINUTES,
      ),
    );
  }

  let operationalAlert: OrderOperationalAlertDTO | null = null;
  switch (order.status) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      if (stageElapsed >= (configuredStageThreshold ?? ACCEPTANCE_ALERT_MINUTES)) {
        const threshold = configuredStageThreshold ?? ACCEPTANCE_ALERT_MINUTES;
        operationalAlert = liveAlert(
          'ACCEPTANCE_OVERDUE',
          formatSlaAlertLabel('Aceite', stageElapsed, threshold),
          stageElapsed,
          threshold,
        );
      }
      break;
    case 'CONFIRMED':
      if (stageElapsed >= (configuredStageThreshold ?? CONFIRMED_ALERT_MINUTES)) {
        const threshold = configuredStageThreshold ?? CONFIRMED_ALERT_MINUTES;
        operationalAlert = liveAlert(
          'PREPARATION_OVERDUE',
          formatSlaAlertLabel('Início do preparo', stageElapsed, threshold),
          stageElapsed,
          threshold,
        );
      }
      break;
    case 'READY': {
      const pickup = order.modality === 'PICKUP';
      const threshold =
        configuredStageThreshold ??
        (pickup ? READY_PICKUP_ALERT_MINUTES : READY_DISPATCH_ALERT_MINUTES);
      if (stageElapsed >= threshold) {
        operationalAlert = liveAlert(
          pickup ? 'READY_WAITING_PICKUP' : 'READY_WAITING_DISPATCH',
          formatSlaAlertLabel(pickup ? 'Retirada' : 'Despacho', stageElapsed, threshold),
          stageElapsed,
          threshold,
        );
      }
      break;
    }
    case 'PREPARING': {
      const threshold = configuredStageThreshold;
      if (threshold !== null && threshold !== undefined && stageElapsed >= threshold) {
        operationalAlert = liveAlert(
          'PREPARATION_OVERDUE',
          formatSlaAlertLabel('Preparo', stageElapsed, threshold),
          stageElapsed,
          threshold,
        );
      } else if (threshold === undefined) {
        operationalAlert =
          order.stageAlerts.find((alert) => alert.code === 'PREPARATION_OVERDUE') ?? null;
      }
      break;
    }
    case 'OUT_FOR_DELIVERY': {
      const threshold = configuredStageThreshold;
      if (threshold !== null && threshold !== undefined && stageElapsed >= threshold) {
        operationalAlert = liveAlert(
          'DELIVERY_OVERDUE',
          formatSlaAlertLabel('Entrega', stageElapsed, threshold),
          stageElapsed,
          threshold,
        );
      } else if (threshold === undefined) {
        operationalAlert =
          order.stageAlerts.find((alert) => alert.code === 'DELIVERY_OVERDUE') ?? null;
      }
      break;
    }
    default:
      break;
  }

  if (operationalAlert) alerts.push(operationalAlert);
  return alerts;
}

let minuteSnapshot = 0;
let minuteInterval: number | null = null;
const minuteListeners = new Set<() => void>();

function emitMinute() {
  minuteSnapshot = Date.now();
  minuteListeners.forEach((listener) => listener());
}

function subscribeToMinute(listener: () => void) {
  minuteListeners.add(listener);
  if (minuteInterval === null) {
    emitMinute();
    minuteInterval = window.setInterval(emitMinute, 60_000);
  }
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size === 0 && minuteInterval !== null) {
      window.clearInterval(minuteInterval);
      minuteInterval = null;
    }
  };
}

function getMinuteSnapshot() {
  return minuteSnapshot;
}

function LiveElapsedStageTime({ order }: { order: OrderCardData }) {
  const now = useSyncExternalStore(subscribeToMinute, getMinuteSnapshot, () => 0);
  const effectiveNow =
    now || new Date(order.stageStartedAt).getTime() + (order.stageElapsedMinutes ?? 0) * 60_000;
  const elapsedMinutes = elapsedMinutesAt(
    effectiveNow,
    order.stageStartedAt,
    order.stageElapsedMinutes ?? 0,
  );
  const alerts = deriveLiveStageAlerts(order, effectiveNow);

  return (
    <span
      className={
        alerts.length ? 'text-warning text-sm font-semibold' : 'text-text-secondary text-sm'
      }
    >
      {formatElapsedMinutes(elapsedMinutes)}
    </span>
  );
}

function LivePrimaryAlert({ order }: { order: OrderCardData }) {
  const now = useSyncExternalStore(subscribeToMinute, getMinuteSnapshot, () => 0);
  const effectiveNow =
    now || new Date(order.stageStartedAt).getTime() + (order.stageElapsedMinutes ?? 0) * 60_000;
  const alert = deriveLiveStageAlerts(order, effectiveNow)[0];
  if (!alert) return null;

  return (
    <div
      data-order-live-alert={alert.severity}
      className={`order-card-alert ${
        alert.severity === 'critical'
          ? 'bg-error-light text-error'
          : 'bg-warning-light text-warning'
      } mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold`}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="line-clamp-2 sm:line-clamp-none">{alert.label}</span>
    </div>
  );
}

function LivePromisedFulfillment({ order, timeZone }: { order: OrderCardData; timeZone?: string }) {
  const now = useSyncExternalStore(subscribeToMinute, getMinuteSnapshot, () => 0);
  const effectiveNow =
    now || new Date(order.stageStartedAt).getTime() + (order.stageElapsedMinutes ?? 0) * 60_000;
  const promised = formatPromisedFulfillment(
    order.promisedFulfillmentMinAt,
    order.promisedFulfillmentMaxAt,
    timeZone,
    effectiveNow,
    order.status !== 'DELIVERED' && order.status !== 'CANCELLED',
  );
  if (!promised) return null;

  return (
    <div className="col-span-2 min-w-0">
      <dt className="sr-only">Previsão de conclusão</dt>
      <dd
        data-order-promised-overdue={promised.isOverdue ? 'true' : 'false'}
        className={`flex items-center gap-1.5 ${
          promised.isOverdue ? 'text-error font-semibold' : 'text-text-secondary'
        } order-card-promised`}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {promised.label}
      </dd>
    </div>
  );
}

export function OrderCard({ order, onClick, selected = false, timeZone, footer }: OrderCardProps) {
  const statusInfo = statusMap[order.status as OrderStatus];
  const paymentInfo = paymentStatusMap[order.paymentStatus as PaymentStatus];
  const StatusIcon = statusInfo.icon;
  const preview = order.itemPreview?.slice(0, 3) ?? [];
  const mobilePreviewCount = Math.min(preview.length, 2);
  const mobileRemainingItems = Math.max(order.itemCount - mobilePreviewCount, 0);
  const importantNote = preview.find((item) => item.notes?.trim())?.notes?.trim() ?? null;

  return (
    <article
      aria-labelledby={`order-card-title-${order.id}`}
      className={`order-card-operational bg-surface group w-full rounded-xl border p-3 shadow-sm transition-[border-color,box-shadow,transform] duration-150 motion-reduce:transition-none ${
        selected
          ? 'border-brand-500 ring-brand-500/20 ring-2'
          : order.hasOperationalAlert
            ? 'border-warning/60'
            : 'border-border hover:border-brand-300 hover:shadow-md'
      }`}
    >
      <div className="order-card-header flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3
              id={`order-card-title-${order.id}`}
              className="text-text-primary font-mono text-base font-extrabold"
            >
              #{order.orderNumber}
            </h3>
            <LiveElapsedStageTime order={order} />
          </div>
          <div className="order-card-customer-row mt-1 flex min-w-0 items-center gap-2">
            <p className="text-text-primary line-clamp-2 min-w-0 text-sm leading-snug font-semibold break-words">
              {order.customerDisplayName}
            </p>
            <span className="order-card-mobile-modality text-text-secondary shrink-0 text-xs">
              {order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}
            </span>
          </div>
        </div>
        <span
          className={`order-card-status inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold ${statusInfo.color}`}
        >
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {statusInfo.label}
        </span>
      </div>

      {preview.length > 0 ? (
        <ul
          className="order-card-items text-text-secondary mt-3 space-y-1 text-sm"
          aria-label="Prévia dos itens"
        >
          {preview.map((item, index) => (
            <li
              key={item.id}
              className={`order-card-item flex min-w-0 items-baseline gap-1.5 ${
                index >= 2 ? 'order-card-item-mobile-hidden' : ''
              }`}
            >
              <span className="text-text-primary shrink-0 font-mono font-semibold">
                {item.quantity}×
              </span>
              <span className="line-clamp-1">{item.productName}</span>
            </li>
          ))}
          {order.itemCount > preview.length ? (
            <li className="order-card-more-desktop text-text-muted text-xs">
              + mais itens no pedido
            </li>
          ) : null}
          {mobileRemainingItems > 0 ? (
            <li className="order-card-more-mobile text-text-muted text-xs">
              + {mobileRemainingItems} {mobileRemainingItems === 1 ? 'item' : 'itens'}
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-text-secondary mt-3 text-sm">
          {order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}
        </p>
      )}

      {importantNote || order.hasCustomerNotes ? (
        <p className="order-card-note bg-brand-50 text-brand-800 mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm">
          <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-1 sm:line-clamp-2">
            <span className="font-semibold sm:hidden">Obs: </span>
            {importantNote ?? 'Este pedido possui observações do cliente.'}
          </span>
        </p>
      ) : null}

      <LivePrimaryAlert order={order} />

      <dl className="order-card-meta border-border mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
        <div className="order-card-meta-modality min-w-0">
          <dt className="sr-only">Modalidade</dt>
          <dd className="text-text-secondary flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {order.modality === 'DELIVERY' ? 'Entrega' : 'Retirada'}
          </dd>
        </div>
        <div className="order-card-meta-total min-w-0 text-right">
          <dt className="sr-only">Total</dt>
          <dd className="text-text-primary flex items-center justify-end gap-2 font-mono font-bold">
            <span className="order-card-mobile-total-label text-text-secondary font-sans text-xs font-medium">
              Total
            </span>
            {formatCurrency(order.total)}
          </dd>
        </div>
        <div className="order-card-meta-payment col-span-2 min-w-0">
          <dt className="sr-only">Pagamento</dt>
          <dd className="text-text-secondary flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span
              className={`inline-flex max-w-full flex-wrap rounded px-1.5 py-0.5 leading-tight ${paymentInfo.color}`}
            >
              {order.paymentMethod === 'PIX'
                ? 'Pix'
                : order.paymentMethod === 'CASH'
                  ? 'Dinheiro'
                  : 'Cartão'}{' '}
              · {paymentInfo.label}
            </span>
          </dd>
        </div>
        <LivePromisedFulfillment order={order} timeZone={timeZone} />
      </dl>

      <div className="order-card-actions border-border mt-3 flex items-center gap-2 border-t pt-3">
        {footer ? <div className="order-card-primary-action min-w-0 flex-1">{footer}</div> : null}
        <Button
          id={`order-card-trigger-${order.id}`}
          type="button"
          variant="outline"
          size="icon"
          onClick={onClick}
          aria-expanded={selected}
          aria-controls="order-details-panel"
          aria-label={`Abrir pedido ${order.orderNumber}`}
          className="order-card-details-trigger ml-auto shrink-0"
        >
          <Eye aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
