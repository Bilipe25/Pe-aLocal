import type { OrderModality } from '@prisma/client';

import { storePwaIconUrl } from '@/features/assets/urls';
import { formatCurrency } from '@/lib/utils';
import { sha256Topic } from '@/lib/web-push/base64url';

export interface MerchantNewOrderNotificationInput {
  eventId: string;
  orderId: string;
  orderNumber: number;
  orderVersion: number;
  storeId: string;
  storeName: string;
  origin: string;
  total: number;
  modality: OrderModality;
  itemCount: number;
  includeStoreName: boolean;
  pendingActionableCount: number;
  iconAssetId: string | null;
}

function itemLabel(count: number) {
  return `${count} ${count === 1 ? 'item' : 'itens'}`;
}

export async function buildMerchantNewOrderNotification(input: MerchantNewOrderNotificationInput) {
  const query = new URLSearchParams({ store: input.storeId, order: input.orderId });
  const relativeUrl = `/dashboard/orders/open?${query.toString()}`;
  const topic = await sha256Topic(`merchant:${input.orderId}`);
  const tag = `merchant-order-${topic}`;
  const details = [
    formatCurrency(input.total),
    input.modality === 'DELIVERY' ? 'Entrega' : 'Retirada',
    itemLabel(input.itemCount),
  ];
  if (input.includeStoreName) details.unshift(input.storeName);
  const icon = new URL(
    input.iconAssetId
      ? storePwaIconUrl(input.iconAssetId, 'any-192')
      : '/pwa/pedidolocal-icon-v1-192.png',
    input.origin,
  ).toString();

  return {
    topic,
    payload: {
      web_push: 8030,
      notification: {
        title: `Novo pedido #${input.orderNumber}`,
        body: details.join(' • '),
        navigate: new URL(relativeUrl, input.origin).toString(),
        icon,
        tag,
        lang: 'pt-BR',
        dir: 'ltr',
        renotify: true,
        requireInteraction: true,
        actions: [{ action: 'open-order', title: 'Abrir pedido' }],
      },
      pedidolocal: {
        schemaVersion: 1,
        audience: 'merchant',
        type: 'new-order',
        eventId: input.eventId,
        orderVersion: input.orderVersion,
        relativeUrl,
        tag,
        pendingActionableCount: Math.max(0, input.pendingActionableCount),
      },
    },
  } as const;
}

export function buildMerchantTestNotification(origin: string) {
  const relativeUrl = '/dashboard/orders';
  return {
    topic: 'pedidolocal-merchant-test',
    payload: {
      web_push: 8030,
      notification: {
        title: 'PedidoLocal',
        body: 'Notificações funcionando. Este dispositivo está pronto para receber novos pedidos.',
        navigate: new URL(relativeUrl, origin).toString(),
        icon: new URL('/pwa/pedidolocal-icon-v1-192.png', origin).toString(),
        tag: 'pedidolocal-merchant-test',
        lang: 'pt-BR',
        dir: 'ltr',
        renotify: false,
        requireInteraction: false,
      },
      pedidolocal: {
        schemaVersion: 1,
        audience: 'merchant',
        type: 'test',
        relativeUrl,
        tag: 'pedidolocal-merchant-test',
      },
    },
  } as const;
}
