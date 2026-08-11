import { describe, expect, it } from 'vitest';

import {
  buildMerchantNewOrderNotification,
  buildMerchantTestNotification,
} from '@/lib/web-push/merchant-notification';

const input = {
  eventId: '00000000-0000-4000-8000-000000000010',
  orderId: '00000000-0000-4000-8000-000000000011',
  orderNumber: 184,
  orderVersion: 0,
  storeId: '00000000-0000-4000-8000-000000000012',
  storeName: 'Burger do ZÃ©',
  origin: 'https://pedidolocal.test',
  total: 6790,
  modality: 'DELIVERY' as const,
  itemCount: 4,
  includeStoreName: false,
  pendingActionableCount: 2,
  iconAssetId: null,
};

describe('payload Merchant Web Push', () => {
  it('usa dados operacionais mÃ­nimos, deep link seguro e alerta persistente', async () => {
    const result = await buildMerchantNewOrderNotification(input);
    expect(result.payload.notification).toMatchObject({
      title: 'Novo pedido #184',
      renotify: true,
      requireInteraction: true,
    });
    expect(result.payload.notification.body).toMatch(/^R\$\s67,90 • Entrega • 4 itens$/);
    expect(result.payload.pedidolocal).toMatchObject({
      audience: 'merchant',
      type: 'new-order',
      pendingActionableCount: 2,
    });
    expect(result.payload.pedidolocal.relativeUrl).toBe(
      `/dashboard/orders/open?store=${input.storeId}&order=${input.orderId}`,
    );
    expect(JSON.stringify(result.payload)).not.toContain('publicToken');
  });

  it('inclui a loja apenas para dispositivo multi-loja', async () => {
    const result = await buildMerchantNewOrderNotification({ ...input, includeStoreName: true });
    expect(result.payload.notification.body).toContain('Burger do ZÃ©');
  });

  it('teste nÃ£o altera badge nem carrega pedido', () => {
    const result = buildMerchantTestNotification(input.origin);
    expect(result.payload.pedidolocal.type).toBe('test');
    expect(result.payload.pedidolocal).not.toHaveProperty('pendingActionableCount');
  });
});
