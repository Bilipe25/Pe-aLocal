import type { OrderModality, OrderStatus } from '@prisma/client';

import { storePwaIconUrl } from '@/features/assets/urls';
import { sha256Topic } from '@/lib/web-push/base64url';

export const WEB_PUSH_EVENT_STATUS = {
  ORDER_ACCEPTED: 'CONFIRMED',
  ORDER_PREPARING: 'PREPARING',
  ORDER_READY: 'READY',
  ORDER_DISPATCHED: 'OUT_FOR_DELIVERY',
  ORDER_COMPLETED: 'DELIVERED',
  ORDER_CANCELLED: 'CANCELLED',
} as const satisfies Partial<Record<string, OrderStatus>>;

export type NotifiableOrderStatus =
  (typeof WEB_PUSH_EVENT_STATUS)[keyof typeof WEB_PUSH_EVENT_STATUS];

function notificationBody(status: NotifiableOrderStatus, modality: OrderModality): string {
  switch (status) {
    case 'CONFIRMED':
      return 'Seu pedido foi confirmado.';
    case 'PREPARING':
      return 'Seu pedido está em preparo.';
    case 'READY':
      return modality === 'PICKUP'
        ? 'Seu pedido está pronto para retirada.'
        : modality === 'DINE_IN'
          ? 'Seu pedido está pronto e será levado à sua mesa.'
          : 'Seu pedido está pronto e aguarda a saída para entrega.';
    case 'OUT_FOR_DELIVERY':
      return 'Seu pedido está a caminho.';
    case 'DELIVERED':
      return modality === 'PICKUP'
        ? 'Seu pedido foi retirado. Esperamos que aproveite!'
        : modality === 'DINE_IN'
          ? 'Seu pedido foi entregue na mesa. Bom apetite!'
          : 'Seu pedido foi entregue. Esperamos que aproveite!';
    case 'CANCELLED':
      return 'Seu pedido foi cancelado. Abra para ver os detalhes.';
  }
}

export function shouldRenotifyOrderStatus(): boolean {
  return true;
}

export interface WebPushNotificationInput {
  eventId: string;
  orderId: string;
  orderVersion: number;
  storeName: string;
  storeSlug: string;
  publicToken: string;
  origin: string;
  status: NotifiableOrderStatus;
  modality: OrderModality;
  iconAssetId: string | null;
  preserveMerchantBadge?: boolean;
}

export async function buildWebPushNotification(input: WebPushNotificationInput) {
  const relativeUrl = `/${encodeURIComponent(input.storeSlug)}/order/${encodeURIComponent(input.publicToken)}`;
  const navigate = new URL(relativeUrl, input.origin).toString();
  const tag = `pedido-${await sha256Topic(input.orderId)}`;
  const icon = new URL(
    input.iconAssetId
      ? storePwaIconUrl(input.iconAssetId, 'any-192')
      : '/pwa/pedidolocal-icon-v1-192.png',
    input.origin,
  ).toString();

  return {
    topic: await sha256Topic(input.orderId),
    payload: {
      web_push: 8030,
      notification: {
        title: input.storeName,
        body: notificationBody(input.status, input.modality),
        navigate,
        icon,
        tag,
        lang: 'pt-BR',
        dir: 'ltr',
        renotify: shouldRenotifyOrderStatus(),
        app_badge: '1',
      },
      pedidolocal: {
        schemaVersion: 1,
        audience: 'consumer',
        type: 'order-status',
        eventId: input.eventId,
        orderVersion: input.orderVersion,
        status: input.status,
        relativeUrl,
        tag,
        badgeMode: input.preserveMerchantBadge ? 'preserve' : 'indicator',
      },
    },
  } as const;
}
