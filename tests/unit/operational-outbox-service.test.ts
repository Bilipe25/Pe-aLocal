import { describe, expect, it, vi } from 'vitest';

import {
  createDiningRoomOperationalEvent,
  processOperationalOutboxMessage,
} from '@/server/services/operational-outbox.service';

const eventId = '00000000-0000-4000-8000-000000000001';
const tenantId = '00000000-0000-4000-8000-000000000002';
const storeId = '00000000-0000-4000-8000-000000000003';
const sessionId = '00000000-0000-4000-8000-000000000004';
const tableId = '00000000-0000-4000-8000-000000000005';

describe('operational outbox', () => {
  it('persiste o evento do salão na transação de negócio', async () => {
    const create = vi.fn().mockResolvedValue({ id: eventId });
    const occurredAt = new Date('2026-08-24T18:00:00.000Z');

    await createDiningRoomOperationalEvent({ operationalOutboxEvent: { create } } as never, {
      tenantId,
      storeId,
      sessionId,
      tableId,
      eventType: 'DINING_SESSION_TRANSFERRED',
      reason: 'TRANSFERRED',
      version: 7,
      occurredAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        aggregateType: 'DINING_SESSION',
        aggregateId: sessionId,
        aggregateVersion: 7,
        eventType: 'DINING_SESSION_TRANSFERRED',
        payload: {
          tableId,
          sessionId,
          reason: 'TRANSFERRED',
          version: 7,
          occurredAt: occurredAt.toISOString(),
        },
      }),
      select: { id: true },
    });
  });

  it('publica uma vez e confirma somente o claim adquirido', async () => {
    const current = {
      id: eventId,
      storeId,
      aggregateId: sessionId,
      aggregateVersion: 7,
      eventType: 'DINING_SESSION_TRANSFERRED',
      schemaVersion: 1,
      status: 'PENDING',
      attempts: 0,
      availableAt: new Date(0),
      lockedAt: null,
      payload: {
        tableId,
        sessionId,
        reason: 'TRANSFERRED',
        version: 7,
        occurredAt: '2026-08-24T18:00:00.000Z',
      },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      operationalOutboxEvent: {
        findUnique: vi.fn().mockResolvedValue(current),
        updateManyAndReturn: vi.fn().mockResolvedValue([{ attempts: 1 }]),
        updateMany,
      },
    };
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };

    const result = await processOperationalOutboxMessage(
      db as never,
      publisher,
      { eventId, schemaVersion: 1, stream: 'OPERATIONAL' },
      1,
      'queue-message-1',
    );

    expect(result).toEqual({ action: 'ack', eventId });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: eventId, storeId, eventType: 'DINING_SESSION_TRANSFERRED' }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });
});
