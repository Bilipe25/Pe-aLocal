import 'server-only';

import type {
  OrderCancellationReasonCode,
  OrderModality,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';

import { getOrderTrackingStateByPublicToken } from '@/server/repositories/order.repository';
import type { CustomerOrderTrackingStateDTO } from '@/types/order-tracking';

interface TrackingSnapshot {
  orderNumber: number;
  modality: OrderModality;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  version: number;
  createdAt: Date;
  statusChangedAt: Date;
  preparingAt: Date | null;
  readyAt: Date | null;
  dispatchedAt: Date | null;
  updatedAt: Date;
  cancellationReasonCode: OrderCancellationReasonCode | null;
  estimatedTimeMinMinutes: number;
  estimatedTimeMaxMinutes: number;
}

const cancellationMessages: Record<OrderCancellationReasonCode, string> = {
  CUSTOMER_REQUEST: 'O pedido foi cancelado conforme solicitado.',
  PRODUCT_UNAVAILABLE: 'A loja cancelou o pedido porque um item ficou indisponível.',
  STORE_UNABLE_TO_FULFILL: 'A loja não conseguiu preparar este pedido e realizou o cancelamento.',
  ADDRESS_PROBLEM: 'A entrega não pôde ser concluída por um problema com o endereço.',
  PAYMENT_NOT_IDENTIFIED: 'O pagamento não foi identificado e o pedido foi cancelado.',
  DUPLICATE_ORDER: 'Este pedido foi identificado como duplicado e cancelado.',
  FRAUD_SUSPECTED: 'O pedido foi cancelado pela loja. Entre em contato se precisar de ajuda.',
  OTHER: 'O pedido foi cancelado pela loja. Entre em contato para mais informações.',
};

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + Math.max(0, minutes) * 60_000);
}

function estimate(snapshot: TrackingSnapshot): CustomerOrderTrackingStateDTO['estimate'] {
  if (snapshot.status === 'DELIVERED' || snapshot.status === 'CANCELLED') return null;
  if (snapshot.status === 'READY') return null;

  const base =
    snapshot.status === 'OUT_FOR_DELIVERY'
      ? (snapshot.dispatchedAt ?? snapshot.statusChangedAt)
      : snapshot.status === 'PREPARING'
        ? (snapshot.preparingAt ?? snapshot.statusChangedAt)
        : snapshot.createdAt;
  const label =
    snapshot.status === 'OUT_FOR_DELIVERY'
      ? 'Previsão de chegada'
      : snapshot.modality === 'PICKUP'
        ? 'Previsão para retirada'
        : 'Previsão do pedido';

  return {
    label,
    minAt: addMinutes(base, snapshot.estimatedTimeMinMinutes).toISOString(),
    maxAt: addMinutes(base, snapshot.estimatedTimeMaxMinutes).toISOString(),
  };
}

export function toCustomerOrderTrackingState(
  snapshot: TrackingSnapshot,
): CustomerOrderTrackingStateDTO {
  return {
    orderNumber: snapshot.orderNumber,
    modality: snapshot.modality,
    status: snapshot.status,
    paymentStatus: snapshot.paymentStatus,
    version: snapshot.version,
    statusChangedAt: snapshot.statusChangedAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    estimate: estimate(snapshot),
    cancellationMessage:
      snapshot.status === 'CANCELLED'
        ? snapshot.cancellationReasonCode
          ? cancellationMessages[snapshot.cancellationReasonCode]
          : 'O pedido foi cancelado pela loja. Entre em contato para mais informações.'
        : null,
  };
}

export async function getCustomerOrderTrackingState(publicToken: string, storeSlug: string) {
  const order = await getOrderTrackingStateByPublicToken(publicToken, storeSlug);
  if (!order) return null;
  return toCustomerOrderTrackingState({
    ...order,
    estimatedTimeMinMinutes: order.store.settings?.estimatedTimeMinMinutes ?? 30,
    estimatedTimeMaxMinutes: order.store.settings?.estimatedTimeMaxMinutes ?? 50,
  });
}
