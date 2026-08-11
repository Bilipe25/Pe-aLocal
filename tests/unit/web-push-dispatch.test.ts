import { describe, expect, it, vi } from 'vitest';

import { projectWebPushDispatch } from '@/server/services/web-push-dispatch.service';

function database(eventType: string, status: string) {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const transaction = {
    webPushDispatch: {
      upsert: vi.fn().mockResolvedValue({ id: 'dispatch-1', status: 'PENDING' }),
      update: vi.fn().mockResolvedValue({}),
    },
    orderPushSubscription: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'association-1', webPushSubscriptionId: 'subscription-1' }]),
    },
    webPushDelivery: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
        aggregateVersion: 2,
        occurredAt: new Date('2026-08-10T12:00:00Z'),
        payload: {
          orderId,
          orderNumber: 42,
          status,
          paymentStatus: 'PENDING',
          version: 2,
          occurredAt: '2026-08-10T12:00:00.000Z',
        },
      }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return { db, transaction };
}

describe('projeção Web Push', () => {
  it('materializa uma entrega por associação ativa de evento elegível', async () => {
    const { db, transaction } = database('ORDER_READY', 'READY');
    const result = await projectWebPushDispatch(db as never, 'event-1');

    expect(result).toEqual({ projected: true, deliveries: 1 });
    expect(transaction.webPushDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ orderStatus: 'READY', aggregateVersion: 2 })],
      skipDuplicates: true,
    });
    expect(transaction.webPushDispatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('materializa a etapa de preparo', async () => {
    const { db, transaction } = database('ORDER_PREPARING', 'PREPARING');
    const result = await projectWebPushDispatch(db as never, 'event-1');

    expect(result).toEqual({ projected: true, deliveries: 1 });
    expect(transaction.webPushDelivery.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ orderStatus: 'PREPARING', aggregateVersion: 2 })],
      skipDuplicates: true,
    });
  });

  it.each([
    ['ORDER_CREATED', 'PENDING'],
    ['PAYMENT_UPDATED', 'CONFIRMED'],
    ['ORDER_READY', 'PREPARING'],
  ])('ignora evento/status fora da matriz: %s/%s', async (eventType, status) => {
    const { db } = database(eventType, status);
    expect(await projectWebPushDispatch(db as never, 'event-1')).toEqual({
      projected: false,
      reason: 'ineligible',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
