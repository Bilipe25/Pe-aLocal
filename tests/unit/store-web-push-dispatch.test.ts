import { describe, expect, it, vi } from 'vitest';

import { projectStoreWebPushDispatch } from '@/server/services/store-web-push-dispatch.service';

function database(eventType = 'ORDER_CREATED', status = 'PENDING', origin: 'POS' | null = null) {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const transaction = {
    storeWebPushDispatch: {
      upsert: vi.fn().mockResolvedValue({ id: 'dispatch-1', status: 'PENDING' }),
      update: vi.fn().mockResolvedValue({}),
    },
    storeStaffPushSubscription: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'association-1',
          webPushSubscriptionId: 'subscription-1',
          disabledAt: null,
          membership: {
            isActive: true,
            role: 'OWNER',
            tenant: { status: 'ACTIVE' },
            user: { isActive: true },
          },
          store: { isActive: true },
          subscription: { revokedAt: null, expirationTime: null },
        },
      ]),
    },
    storeWebPushDelivery: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = {
    orderOutboxEvent: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'event-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        orderId,
        eventType,
        schemaVersion: 1,
        aggregateVersion: 0,
        occurredAt: new Date('2026-08-10T12:00:00Z'),
        payload: {
          orderId,
          orderNumber: 42,
          status,
          paymentStatus: 'PENDING',
          version: 0,
          occurredAt: '2026-08-10T12:00:00.000Z',
        },
        order: { origin },
      }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return { db, transaction };
}

describe('projeÃ§Ã£o Merchant Web Push', () => {
  it('materializa uma entrega por dispositivo autorizado', async () => {
    const { db, transaction } = database();
    expect(await projectStoreWebPushDispatch(db as never, 'event-1')).toEqual({
      projected: true,
      deliveries: 1,
    });
    expect(transaction.storeWebPushDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ webPushSubscriptionId: 'subscription-1' })],
      skipDuplicates: true,
    });
  });

  it.each([
    ['ORDER_ACCEPTED', 'PENDING'],
    ['ORDER_CREATED', 'AWAITING_PAYMENT'],
  ])('recusa evento nÃ£o acionÃ¡vel %s/%s', async (eventType, status) => {
    const { db } = database(eventType, status);
    expect(await projectStoreWebPushDispatch(db as never, 'event-1')).toEqual({
      projected: false,
      reason: 'ineligible',
    });
  });

  it('não notifica a própria equipe por push quando o pedido nasceu no PDV', async () => {
    const { db, transaction } = database('ORDER_CREATED', 'PENDING', 'POS');
    expect(await projectStoreWebPushDispatch(db as never, 'event-1')).toEqual({
      projected: false,
      reason: 'ineligible',
    });
    expect(transaction.storeWebPushDelivery.createMany).not.toHaveBeenCalled();
  });
});
