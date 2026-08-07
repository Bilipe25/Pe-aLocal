import 'server-only';

import type {
  OrderCancellationReasonCode,
  OrderModality,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import { getDb } from '@/server/database/client';
import {
  getFullPublicOrderDetailsByToken,
  getOrderTrackingStateByPublicToken,
  hasActiveOrderTrackingToken,
} from '@/server/repositories/order.repository';
import type { CustomerOrderDetailsDTO, CustomerOrderTrackingStateDTO } from '@/types/order-tracking';

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
  promisedFulfillmentMinAt: Date | null;
  promisedFulfillmentMaxAt: Date | null;
  updatedAt: Date;
  cancellationReasonCode: OrderCancellationReasonCode | null;
  estimatedTimeMinMinutes: number;
  estimatedTimeMaxMinutes: number;
  total?: number | null;
  items?: Array<{
    productId?: string;
    productName: string;
    unitPrice: number;
    quantity: number;
  }>;
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

  if (snapshot.promisedFulfillmentMinAt && snapshot.promisedFulfillmentMaxAt) {
    return {
      label: snapshot.modality === 'PICKUP' ? 'Previsão para retirada' : 'Previsão de chegada',
      minAt: snapshot.promisedFulfillmentMinAt.toISOString(),
      maxAt: snapshot.promisedFulfillmentMaxAt.toISOString(),
    };
  }

  // Pedidos anteriores à introdução do snapshot continuam acompanháveis.
  // Somente esse legado recalcula a janela com a configuração atual da loja.
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
  const itemsSummary =
    snapshot.items && snapshot.items.length > 0
      ? snapshot.items.map((item) => `${item.quantity}x ${item.productName}`).join(', ')
      : null;

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
    totalCents: snapshot.total ?? null,
    itemsSummary,
    items: snapshot.items ?? null,
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

export function canAuthorizeCustomerOrderTracking(publicToken: string, storeSlug: string) {
  return hasActiveOrderTrackingToken(publicToken, storeSlug);
}

const paymentMethodLabels: Record<string, string> = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CARD_ON_DELIVERY: 'Cartão no recebimento',
};

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Recebido',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export async function getCustomerOrderDetails(
  publicToken: string,
  storeSlug: string,
): Promise<CustomerOrderDetailsDTO | null> {
  const order = await getFullPublicOrderDetailsByToken(publicToken, storeSlug);
  if (!order) return null;

  const productIds = order.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  const products =
    productIds.length > 0
      ? await getDb().product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, imageUrl: true, imageAssetId: true },
        })
      : [];

  const productMap = new Map<
    string,
    { id: string; imageUrl: string | null; imageAssetId: string | null }
  >(products.map((p) => [p.id, p]));

  const formattedItems = order.items.map((item) => {
    const p = item.productId ? productMap.get(item.productId) : null;
    const imageUrl = p?.imageAssetId ? storeAssetUrl(p.imageAssetId, 256) : p?.imageUrl ?? null;
    return {
      id: item.id,
      productId: item.productId ?? undefined,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
      itemTotal: item.itemTotal,
      imageUrl,
      imageAssetId: p?.imageAssetId ?? null,
      options: item.options,
    };
  });

  const timelineSteps: Array<{ status: OrderStatus; label: string; date: Date | null }> = [
    { status: 'PENDING', label: 'Pedido recebido', date: order.createdAt },
    { status: 'CONFIRMED', label: 'Pedido confirmado', date: order.acceptedAt },
    { status: 'PREPARING', label: 'Em preparo', date: order.preparingAt },
    { status: 'READY', label: 'Pronto', date: order.readyAt },
  ];

  if (order.modality === 'DELIVERY') {
    timelineSteps.push({
      status: 'OUT_FOR_DELIVERY',
      label: 'Saiu para entrega',
      date: order.dispatchedAt,
    });
  }

  timelineSteps.push({
    status: 'DELIVERED',
    label: order.modality === 'DELIVERY' ? 'Entregue' : 'Retirado',
    date: order.deliveredAt,
  });

  const statusOrder: OrderStatus[] = [
    'PENDING',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];
  const currentIndex = statusOrder.indexOf(order.status);

  const events =
    order.status === 'CANCELLED'
      ? [
          {
            status: 'PENDING' as OrderStatus,
            label: 'Pedido recebido',
            timestamp: order.createdAt.toISOString(),
            completed: true,
            current: false,
          },
          {
            status: 'CANCELLED' as OrderStatus,
            label: 'Pedido cancelado',
            timestamp: (order.cancelledAt ?? order.statusChangedAt).toISOString(),
            completed: true,
            current: true,
          },
        ]
      : timelineSteps
          .filter((_, idx) => currentIndex >= 0 && idx <= currentIndex)
          .map((step) => {
            const isCurrent = order.status === step.status;
            return {
              status: step.status,
              label: step.label,
              timestamp: step.date ? step.date.toISOString() : order.createdAt.toISOString(),
              completed: true,
              current: isCurrent,
            };
          });

  const addressParts = [
    order.deliveryStreet,
    order.deliveryNumber,
    order.deliveryNeighborhood,
    order.deliveryCity,
    order.deliveryComplement ? `(${order.deliveryComplement})` : null,
  ].filter(Boolean);

  const deliveryAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

  return {
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    status: order.status,
    statusLabel: statusLabels[order.status] ?? order.status,
    statusChangedAt: order.statusChangedAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    modality: order.modality,
    paymentMethod: paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    deliveryAddress,
    events,
    items: formattedItems,
  };
}
