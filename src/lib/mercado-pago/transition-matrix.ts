import type { OrderStatus, PaymentStatus } from '@prisma/client';

import type { MercadoPagoMappedState } from './status-mapper';

export type MercadoPagoTransitionDecision =
  | { kind: 'NOOP' }
  | { kind: 'ALERT'; code: string; priority: 'HIGH' | 'CRITICAL' }
  | {
      kind: 'TRANSITION';
      paymentStatus: PaymentStatus;
      orderStatus: OrderStatus;
      reasonCode?: string;
    };

export function decideMercadoPagoTransition(input: {
  currentPaymentStatus: PaymentStatus;
  currentOrderStatus: OrderStatus;
  mapped: MercadoPagoMappedState;
}): MercadoPagoTransitionDecision {
  const { currentPaymentStatus, currentOrderStatus, mapped } = input;
  if (mapped === 'PENDING' || mapped === 'REVIEW') return { kind: 'NOOP' };

  if (currentPaymentStatus === 'REFUNDED') {
    return mapped === 'REFUNDED'
      ? { kind: 'NOOP' }
      : { kind: 'ALERT', code: 'NON_MONOTONIC_AFTER_REFUND', priority: 'HIGH' };
  }

  if (currentPaymentStatus === 'PAID') {
    if (mapped === 'PAID') return { kind: 'NOOP' };
    if (mapped === 'REFUNDED') {
      return { kind: 'TRANSITION', paymentStatus: 'REFUNDED', orderStatus: currentOrderStatus };
    }
    return { kind: 'ALERT', code: 'NON_MONOTONIC_AFTER_PAID', priority: 'CRITICAL' };
  }

  if (mapped === 'REFUNDED') {
    return { kind: 'ALERT', code: 'REFUND_WITHOUT_PAID', priority: 'CRITICAL' };
  }

  if (mapped === 'PAID') {
    if (currentPaymentStatus !== 'PENDING' || currentOrderStatus !== 'AWAITING_PAYMENT') {
      return { kind: 'ALERT', code: 'PAID_AFTER_LOCAL_FINAL_STATE', priority: 'CRITICAL' };
    }
    return { kind: 'TRANSITION', paymentStatus: 'PAID', orderStatus: 'PENDING' };
  }

  if (currentPaymentStatus !== 'PENDING' || currentOrderStatus !== 'AWAITING_PAYMENT') {
    return { kind: 'ALERT', code: 'INCOMPATIBLE_PROVIDER_TRANSITION', priority: 'HIGH' };
  }

  if (mapped === 'CANCELLED') {
    return {
      kind: 'TRANSITION',
      paymentStatus: 'CANCELLED',
      orderStatus: 'CANCELLED',
      reasonCode: 'PROVIDER_CANCELLED',
    };
  }

  return {
    kind: 'TRANSITION',
    paymentStatus: 'FAILED',
    orderStatus: 'CANCELLED',
    reasonCode: mapped === 'EXPIRED' ? 'PROVIDER_EXPIRED' : 'PROVIDER_FAILED',
  };
}
