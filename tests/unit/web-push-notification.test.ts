import { describe, expect, it } from 'vitest';

import {
  buildWebPushNotification,
  shouldNotifyOrderStatus,
  WEB_PUSH_EVENT_STATUS,
} from '@/lib/web-push/notification';

describe('payload Web Push', () => {
  it('mantém a matriz transacional restrita aos estados de alto valor', () => {
    expect(WEB_PUSH_EVENT_STATUS).toEqual({
      ORDER_ACCEPTED: 'CONFIRMED',
      ORDER_READY: 'READY',
      ORDER_DISPATCHED: 'OUT_FOR_DELIVERY',
      ORDER_COMPLETED: 'DELIVERED',
      ORDER_CANCELLED: 'CANCELLED',
    });
    expect(shouldNotifyOrderStatus('READY', 'DELIVERY')).toBe(false);
    expect(shouldNotifyOrderStatus('READY', 'PICKUP')).toBe(true);
  });

  it('gera identidade white-label e mantém token somente na navegação privada', async () => {
    const token = '00000000-0000-4000-8000-000000000001';
    const result = await buildWebPushNotification({
      eventId: 'event-1',
      orderId: 'order-1',
      orderVersion: 3,
      storeName: 'Burger do Zé',
      storeSlug: 'burger-do-ze',
      publicToken: token,
      origin: 'https://pedidolocal.test',
      status: 'READY',
      modality: 'PICKUP',
      iconAssetId: 'asset-1',
    });

    expect(result.payload.notification).toMatchObject({
      title: 'Burger do Zé',
      body: 'Seu pedido está pronto para retirada.',
      icon: 'https://pedidolocal.test/api/store-assets/asset-1?variant=pwa-any-192',
      renotify: true,
    });
    expect(result.payload.pedidolocal.relativeUrl).toContain(token);
    expect(result.payload.notification.title).not.toContain(token);
    expect(result.payload.notification.body).not.toContain(token);
    expect(result.payload.notification.tag).not.toContain(token);
  });

  it('não força novo alerta em atualizações informativas', async () => {
    const result = await buildWebPushNotification({
      eventId: 'event-1',
      orderId: 'order-1',
      orderVersion: 1,
      storeName: 'Burger do Zé',
      storeSlug: 'burger-do-ze',
      publicToken: '00000000-0000-4000-8000-000000000001',
      origin: 'https://pedidolocal.test',
      status: 'CONFIRMED',
      modality: 'DELIVERY',
      iconAssetId: null,
    });

    expect(result.payload.notification.renotify).toBe(false);
  });
});
