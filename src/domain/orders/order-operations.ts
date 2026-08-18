import type { OrderModality, OrderStatus, PaymentMethod, PaymentStatus } from '@/types';
import { formatSlaAlertLabel } from './order-time';
import { getOrderOperationalSlaStage, type OrderOperationalSlaConfig } from './operational-sla';

export type OrderOperationalAlertCode =
  | 'ACCEPTANCE_OVERDUE'
  | 'PREPARATION_OVERDUE'
  | 'READY_WAITING_PICKUP'
  | 'READY_WAITING_DISPATCH'
  | 'DELIVERY_OVERDUE'
  | 'PAYMENT_REVIEW_REQUIRED'
  | 'PAYMENT_OVERDUE';

export interface OrderOperationalAlert {
  code: OrderOperationalAlertCode;
  label: string;
  severity: 'warning' | 'critical';
}

export interface OrderOperationalInput {
  status: OrderStatus;
  modality: OrderModality;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  dispatchedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  statusChangedAt: Date;
  operationalStartedAt?: Date | null;
  operationalSla?: OrderOperationalSlaConfig;
  estimatedTimeMaxMinutes: number;
}

export interface OrderStageDurations {
  acceptanceMinutes: number | null;
  preparationMinutes: number | null;
  readyMinutes: number | null;
  deliveryMinutes: number | null;
  totalMinutes: number;
}

const CONFIRMED_ALERT_MINUTES = 5;
const READY_PICKUP_ALERT_MINUTES = 15;
const READY_DISPATCH_ALERT_MINUTES = 5;
const PAYMENT_ALERT_MINUTES = 10;

export function getOrderStageAlertThresholdMinutes(
  input: Pick<OrderOperationalInput, 'status' | 'modality' | 'estimatedTimeMaxMinutes'>,
) {
  switch (input.status) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      return null;
    case 'CONFIRMED':
      return CONFIRMED_ALERT_MINUTES;
    case 'PREPARING':
      return Math.max(1, input.estimatedTimeMaxMinutes);
    case 'READY':
      return input.modality === 'PICKUP'
        ? READY_PICKUP_ALERT_MINUTES
        : READY_DISPATCH_ALERT_MINUTES;
    case 'OUT_FOR_DELIVERY':
      return Math.max(15, input.estimatedTimeMaxMinutes);
    case 'DELIVERED':
    case 'CANCELLED':
      return null;
  }
}

function minutesBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

function currentStage(input: OrderOperationalInput) {
  switch (input.status) {
    case 'PENDING':
      return { label: 'Aguardando aceite', startedAt: input.statusChangedAt };
    case 'AWAITING_PAYMENT':
      return { label: 'Aguardando pagamento', startedAt: input.createdAt };
    case 'CONFIRMED':
      return { label: 'Aguardando preparo', startedAt: input.acceptedAt ?? input.statusChangedAt };
    case 'PREPARING':
      return { label: 'Em preparo', startedAt: input.preparingAt ?? input.statusChangedAt };
    case 'READY':
      return {
        label: input.modality === 'PICKUP' ? 'Aguardando retirada' : 'Aguardando despacho',
        startedAt: input.readyAt ?? input.statusChangedAt,
      };
    case 'OUT_FOR_DELIVERY':
      return { label: 'Em entrega', startedAt: input.dispatchedAt ?? input.statusChangedAt };
    case 'DELIVERED':
      return { label: 'Concluído', startedAt: input.deliveredAt ?? input.statusChangedAt };
    case 'CANCELLED':
      return { label: 'Cancelado', startedAt: input.cancelledAt ?? input.statusChangedAt };
  }
}

function operationalAlert(
  input: OrderOperationalInput,
  elapsedMinutes: number,
): OrderOperationalAlert | null {
  const critical = (threshold: number) => elapsedMinutes >= threshold * 2;
  switch (input.status) {
    case 'PENDING': {
      if (!input.operationalSla) return null;
      const stage = getOrderOperationalSlaStage(
        {
          status: input.status,
          statusChangedAt: input.statusChangedAt,
          config: input.operationalSla,
        },
        new Date(input.statusChangedAt.getTime() + elapsedMinutes * 60_000),
      );
      if (stage !== 'WARNING' && stage !== 'CRITICAL') return null;
      return {
        code: 'ACCEPTANCE_OVERDUE',
        label:
          stage === 'CRITICAL'
            ? `Atenção: ${elapsedMinutes} min sem aceite`
            : `Precisa de atenção · ${elapsedMinutes} min sem aceite`,
        severity: stage === 'CRITICAL' ? 'critical' : 'warning',
      };
    }
    case 'AWAITING_PAYMENT':
      return null;
    case 'CONFIRMED':
      return elapsedMinutes >= CONFIRMED_ALERT_MINUTES
        ? {
            code: 'PREPARATION_OVERDUE',
            label: formatSlaAlertLabel(
              'Início do preparo',
              elapsedMinutes,
              CONFIRMED_ALERT_MINUTES,
            ),
            severity: critical(CONFIRMED_ALERT_MINUTES) ? 'critical' : 'warning',
          }
        : null;
    case 'PREPARING': {
      const threshold = Math.max(1, input.estimatedTimeMaxMinutes);
      return elapsedMinutes >= threshold
        ? {
            code: 'PREPARATION_OVERDUE',
            label: formatSlaAlertLabel('Preparo', elapsedMinutes, threshold),
            severity: critical(threshold) ? 'critical' : 'warning',
          }
        : null;
    }
    case 'READY': {
      const pickup = input.modality === 'PICKUP';
      const threshold = pickup ? READY_PICKUP_ALERT_MINUTES : READY_DISPATCH_ALERT_MINUTES;
      return elapsedMinutes >= threshold
        ? {
            code: pickup ? 'READY_WAITING_PICKUP' : 'READY_WAITING_DISPATCH',
            label: formatSlaAlertLabel(pickup ? 'Retirada' : 'Despacho', elapsedMinutes, threshold),
            severity: critical(threshold) ? 'critical' : 'warning',
          }
        : null;
    }
    case 'OUT_FOR_DELIVERY': {
      const threshold = Math.max(15, input.estimatedTimeMaxMinutes);
      return elapsedMinutes >= threshold
        ? {
            code: 'DELIVERY_OVERDUE',
            label: formatSlaAlertLabel('Entrega', elapsedMinutes, threshold),
            severity: critical(threshold) ? 'critical' : 'warning',
          }
        : null;
    }
    case 'DELIVERED':
    case 'CANCELLED':
      return null;
  }
}

function paymentAlert(input: OrderOperationalInput, now: Date): OrderOperationalAlert | null {
  if (input.status === 'DELIVERED' || input.status === 'CANCELLED') return null;
  if (input.paymentStatus === 'CUSTOMER_REPORTED_PAID') {
    return {
      code: 'PAYMENT_REVIEW_REQUIRED',
      label: 'Cliente informou o pagamento',
      severity: 'warning',
    };
  }
  const elapsed = minutesBetween(input.createdAt, now) ?? 0;
  if (
    input.paymentMethod === 'PIX' &&
    input.paymentStatus === 'PENDING' &&
    elapsed >= PAYMENT_ALERT_MINUTES
  ) {
    return {
      code: 'PAYMENT_OVERDUE',
      label: formatSlaAlertLabel('Pix', elapsed, PAYMENT_ALERT_MINUTES),
      severity: elapsed >= PAYMENT_ALERT_MINUTES * 2 ? 'critical' : 'warning',
    };
  }
  return null;
}

export function getOrderOperationalSnapshot(input: OrderOperationalInput, now = new Date()) {
  const stage = currentStage(input);
  const elapsedMinutes = minutesBetween(stage.startedAt, now) ?? 0;
  const end = input.deliveredAt ?? input.cancelledAt ?? now;
  const readyEnd = input.dispatchedAt ?? input.deliveredAt ?? input.cancelledAt ?? now;
  const alerts = [paymentAlert(input, now), operationalAlert(input, elapsedMinutes)].filter(
    (alert): alert is OrderOperationalAlert => Boolean(alert),
  );

  return {
    stageLabel: stage.label,
    stageStartedAt: stage.startedAt,
    elapsedMinutes,
    alerts,
    durations: {
      acceptanceMinutes: minutesBetween(
        input.operationalStartedAt ?? input.createdAt,
        input.acceptedAt ?? (input.status === 'PENDING' ? now : null),
      ),
      preparationMinutes: minutesBetween(
        input.preparingAt,
        input.readyAt ?? (input.status === 'PREPARING' ? now : null),
      ),
      readyMinutes: minutesBetween(input.readyAt, input.status === 'READY' ? now : readyEnd),
      deliveryMinutes: minutesBetween(
        input.dispatchedAt,
        input.deliveredAt ?? (input.status === 'OUT_FOR_DELIVERY' ? now : null),
      ),
      totalMinutes: minutesBetween(input.createdAt, end) ?? 0,
    } satisfies OrderStageDurations,
  };
}
