import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrderEventPublisher } from '@/lib/pusher/order-event-publisher';

const mocks = vi.hoisted(() => ({ trigger: vi.fn() }));

vi.mock('pusher', () => ({
  default: vi.fn(function MockPusher() {
    return { trigger: mocks.trigger };
  }),
}));

describe('publicação do acompanhamento privado do cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trigger.mockResolvedValue({});
  });

  it('envia payload mínimo ao canal derivado sem orderId ou token', async () => {
    const publicToken = '4da03571-bffd-45ef-8c44-20686c487838';
    const publisher = createOrderEventPublisher({
      appId: 'app',
      key: 'key',
      secret: 'secret',
      cluster: 'cluster',
      includeLegacyPublicChannel: false,
      resolvePublicToken: vi.fn().mockResolvedValue(publicToken),
    });
    await publisher.publish({
      id: '00000000-0000-4000-8000-000000000004',
      storeId: 'store-a',
      eventType: 'ORDER_PREPARING',
      schemaVersion: 1,
      payload: {
        orderId: '4da03571-bffd-45ef-8c44-20686c487839',
        orderNumber: 42,
        status: 'PREPARING',
        paymentStatus: 'PENDING',
        version: 2,
        occurredAt: '2026-07-22T12:00:00.000Z',
      },
    });

    expect(mocks.trigger).toHaveBeenCalledTimes(2);
    const [channel, eventName, payload] = mocks.trigger.mock.calls[1];
    expect(channel).toMatch(/^private-order-[a-f0-9]{64}$/);
    expect(channel).not.toContain(publicToken);
    expect(eventName).toBe('tracking-updated');
    expect(payload).toEqual({
      status: 'PREPARING',
      paymentStatus: 'PENDING',
      version: 2,
      timestamp: Date.parse('2026-07-22T12:00:00.000Z'),
    });
    expect(payload).not.toHaveProperty('orderId');
    expect(payload).not.toHaveProperty('orderNumber');
  });

  it('mantém observações internas restritas ao canal operacional', async () => {
    const resolvePublicToken = vi.fn().mockResolvedValue('4da03571-bffd-45ef-8c44-20686c487838');
    const publisher = createOrderEventPublisher({
      appId: 'app',
      key: 'key',
      secret: 'secret',
      cluster: 'cluster',
      includeLegacyPublicChannel: false,
      resolvePublicToken,
    });

    await publisher.publish({
      id: '00000000-0000-4000-8000-000000000005',
      storeId: 'store-a',
      eventType: 'ORDER_INTERNAL_NOTE_ADDED',
      schemaVersion: 1,
      payload: {
        orderId: '4da03571-bffd-45ef-8c44-20686c487839',
        orderNumber: 42,
        status: 'PREPARING',
        paymentStatus: 'PENDING',
        version: 3,
        occurredAt: '2026-07-22T12:01:00.000Z',
      },
    });

    expect(mocks.trigger).toHaveBeenCalledTimes(1);
    expect(resolvePublicToken).not.toHaveBeenCalled();
  });
});
