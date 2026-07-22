import { describe, expect, it, vi } from 'vitest';

import { appendOrderOutboxEvent } from '@/server/services/order-outbox.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const storeId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const auditLogId = '00000000-0000-4000-8000-000000000004';

describe('order outbox producer', () => {
  it('persiste um envelope versionado e correlacionado na transação recebida', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'outbox-a' });
    const tx = { orderOutboxEvent: { create } };

    const event = await appendOrderOutboxEvent(tx as never, {
      tenantId,
      storeId,
      orderId,
      auditLogId,
      eventType: 'ORDER_ACCEPTED',
      orderNumber: 12,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      aggregateVersion: 4,
      occurredAt: new Date('2026-07-22T10:00:00.000Z'),
    });

    expect(event).toEqual({ id: 'outbox-a' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schemaVersion: 1,
        eventType: 'ORDER_ACCEPTED',
        aggregateVersion: 4,
        auditLogId,
        payload: {
          orderId,
          orderNumber: 12,
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          version: 4,
          occurredAt: '2026-07-22T10:00:00.000Z',
        },
      }),
      select: { id: true },
    });
  });

  it('propaga falha da escrita para abortar a transação chamadora', async () => {
    const create = vi.fn().mockRejectedValue(new Error('outbox unavailable'));
    const tx = { orderOutboxEvent: { create } };

    await expect(
      appendOrderOutboxEvent(tx as never, {
        tenantId,
        storeId,
        orderId,
        auditLogId,
        eventType: 'ORDER_ACCEPTED',
        orderNumber: 12,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        aggregateVersion: 4,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('outbox unavailable');
  });
});
