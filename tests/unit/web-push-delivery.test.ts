import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  resolveIdentity: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('@/server/services/web-push-sender', () => ({
  sendWebPushNotification: mocks.send,
  webPushFailure: vi.fn(() => ({
    statusCode: null,
    retryAfterSeconds: null,
    message: 'push_transport_error',
    revoked: false,
    transient: true,
  })),
}));

vi.mock('@/server/services/web-push-store-identity.service', () => ({
  resolveWebPushStoreIdentity: mocks.resolveIdentity,
}));

vi.mock('@/server/services/web-push-revocation.service', () => ({
  revokeWebPushSubscription: mocks.revoke,
}));

import { processWebPushDeliveriesForEvent } from '@/server/services/web-push-delivery.service';

const config = {
  publicKey: 'A'.repeat(87),
  privateKey: 'B'.repeat(43),
  subject: 'mailto:push@pedidolocal.test',
};

function database(orderStatus: 'PREPARING' | 'OUT_FOR_DELIVERY') {
  const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const associationUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const db = {
    webPushDelivery: {
      findMany: vi.fn().mockResolvedValue([{ id: 'delivery-1' }]),
      updateManyAndReturn: vi.fn().mockResolvedValue([
        {
          id: 'delivery-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          orderId: 'order-1',
          orderOutboxEventId: 'event-1',
          orderPushSubscriptionId: 'association-1',
          webPushSubscriptionId: 'subscription-1',
          orderStatus,
          aggregateVersion: 3,
          attempts: 1,
        },
      ]),
      updateMany: deliveryUpdate,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    orderPushSubscription: {
      updateMany: associationUpdate,
      findUnique: vi.fn().mockResolvedValue({
        disabledAt: null,
        terminalNotifiedAt: null,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/device',
          p256dh: 'p256dh',
          auth: 'auth',
          origin: 'https://pedidolocal.test',
          revokedAt: null,
          expirationTime: null,
        },
      }),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue({
        status: orderStatus,
        version: 3,
        modality: 'DELIVERY',
        publicToken: '00000000-0000-4000-8000-000000000001',
        store: { name: 'Burger do Zé', slug: 'burger-do-ze', tenantId: 'tenant-1', id: 'store-1' },
      }),
    },
    storeStaffPushSubscription: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { db, deliveryUpdate };
}

describe('entrega Web Push do consumidor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ statusCode: 201 });
    mocks.resolveIdentity.mockResolvedValue({ iconAssetId: null });
  });

  it('envia a etapa PREPARING e a marca como concluída', async () => {
    const { db, deliveryUpdate } = database('PREPARING');

    const result = await processWebPushDeliveriesForEvent(db as never, config, 'event-1');

    expect(result).toEqual({ candidates: 1, outcomes: { sent: 1 } });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[1].payload.notification).toMatchObject({
      body: 'Seu pedido está em preparo.',
      renotify: true,
    });
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('registra separadamente quando o pedido já mudou de status', async () => {
    const { db, deliveryUpdate } = database('OUT_FOR_DELIVERY');
    db.order.findUnique.mockResolvedValue({
      status: 'DELIVERED',
      version: 4,
      modality: 'DELIVERY',
      publicToken: '00000000-0000-4000-8000-000000000001',
      store: { name: 'Burger do Zé', slug: 'burger-do-ze', tenantId: 'tenant-1', id: 'store-1' },
    });

    const result = await processWebPushDeliveriesForEvent(db as never, config, 'event-1');

    expect(result).toEqual({ candidates: 1, outcomes: { skipped: 1 } });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'current_status_changed',
        }),
      }),
    );
  });
});
