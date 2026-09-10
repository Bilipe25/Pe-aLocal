import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  processLoyaltyForOrder: vi.fn(),
  processCustomerRelationshipForOrder: vi.fn(),
  restoreLoyaltyRewardForCancelledOrder: vi.fn(),
  triggerOrderUpdated: vi.fn(),
  triggerPaymentUpdated: vi.fn(),
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));
vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    $transaction: mocks.transaction,
    orderOutboxEvent: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  }),
}));
vi.mock('@/server/services/loyalty.service', () => ({
  processLoyaltyForOrder: mocks.processLoyaltyForOrder,
  restoreLoyaltyRewardForCancelledOrder: mocks.restoreLoyaltyRewardForCancelledOrder,
}));
vi.mock('@/server/services/customer-relationship.service', () => ({
  processCustomerRelationshipForOrder: mocks.processCustomerRelationshipForOrder,
}));

import { dispatchCommittedOrderEvents } from '@/server/services/order-event-dispatch.service';

describe('order event dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.triggerOrderUpdated.mockResolvedValue(undefined);
    mocks.triggerPaymentUpdated.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation((operation) => operation({ kind: 'tx' }));
    mocks.processLoyaltyForOrder.mockResolvedValue({ credited: true });
    mocks.processCustomerRelationshipForOrder.mockResolvedValue({ updated: true });
    mocks.restoreLoyaltyRewardForCancelledOrder.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publica diretamente e marca a outbox como processada no modo direct', async () => {
    vi.stubEnv('ORDER_EVENT_PUBLISH_MODE', 'direct');

    await expect(
      dispatchCommittedOrderEvents({
        eventIds: ['outbox-a'],
        publishDirect: mocks.triggerOrderUpdated,
      }),
    ).resolves.toEqual({ notificationPending: false });

    expect(mocks.triggerOrderUpdated).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('mantém o evento pendente quando a publicação direta falha', async () => {
    vi.stubEnv('ORDER_EVENT_PUBLISH_MODE', 'direct');
    mocks.triggerOrderUpdated.mockRejectedValue(new Error('Pusher unavailable'));

    await expect(
      dispatchCommittedOrderEvents({
        eventIds: ['outbox-a'],
        publishDirect: mocks.triggerOrderUpdated,
      }),
    ).resolves.toEqual({ notificationPending: true });

    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('projeta fidelidade e relacionamento no modo direct antes de encerrar o evento', async () => {
    vi.stubEnv('ORDER_EVENT_PUBLISH_MODE', 'direct');
    mocks.findMany.mockResolvedValueOnce([
      {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
        eventType: 'ORDER_COMPLETED',
      },
    ]);

    await expect(
      dispatchCommittedOrderEvents({
        eventIds: ['outbox-a'],
        publishDirect: mocks.triggerOrderUpdated,
      }),
    ).resolves.toEqual({ notificationPending: false });

    expect(mocks.processLoyaltyForOrder).toHaveBeenCalledWith(
      { kind: 'tx' },
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a', orderId: 'order-a' }),
    );
    expect(mocks.processCustomerRelationshipForOrder).toHaveBeenCalledOnce();
  });

  it('agenda enqueue com waitUntil sem bloquear a resposta no modo outbox', async () => {
    vi.stubEnv('ORDER_EVENT_PUBLISH_MODE', 'outbox');
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const promises: Promise<unknown>[] = [];
    mocks.getCloudflareContext.mockReturnValue({
      env: { ORDER_OUTBOX_QUEUE: { sendBatch } },
      ctx: { waitUntil: (promise: Promise<unknown>) => promises.push(promise) },
    });

    await expect(
      dispatchCommittedOrderEvents({
        eventIds: ['outbox-a'],
        publishDirect: mocks.triggerOrderUpdated,
      }),
    ).resolves.toEqual({ notificationPending: false });
    await Promise.all(promises);

    expect(sendBatch).toHaveBeenCalledWith([
      { body: { schemaVersion: 1, eventId: 'outbox-a' }, contentType: 'json' },
    ]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('considera dual bem-sucedido quando a Queue aceita após falha direta', async () => {
    vi.stubEnv('ORDER_EVENT_PUBLISH_MODE', 'dual');
    mocks.triggerOrderUpdated.mockRejectedValue(new Error('Pusher unavailable'));
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    mocks.getCloudflareContext.mockReturnValue({
      env: { ORDER_OUTBOX_QUEUE: { sendBatch } },
      ctx: { waitUntil: vi.fn() },
    });

    await expect(
      dispatchCommittedOrderEvents({
        eventIds: ['outbox-a'],
        publishDirect: mocks.triggerOrderUpdated,
      }),
    ).resolves.toEqual({ notificationPending: false });
    expect(sendBatch).toHaveBeenCalledOnce();
  });
});
