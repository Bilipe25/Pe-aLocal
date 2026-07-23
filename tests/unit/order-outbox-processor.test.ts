import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  processOrderOutboxMessage,
  relayPendingOrderOutboxEvents,
} from '@/server/services/order-outbox-processor';

const eventId = '00000000-0000-4000-8000-000000000001';
const storeId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const payload = {
  orderId,
  orderNumber: 12,
  status: 'CONFIRMED',
  paymentStatus: 'PENDING',
  version: 4,
  occurredAt: '2026-07-22T10:00:00.000Z',
};

function createDatabase(eventOverrides: Record<string, unknown> = {}) {
  const event = {
    id: eventId,
    storeId,
    orderId,
    aggregateVersion: 4,
    schemaVersion: 1,
    eventType: 'ORDER_ACCEPTED',
    payload,
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: new Date('2026-07-22T09:00:00.000Z'),
    ...eventOverrides,
  };
  const database = {
    orderOutboxEvent: {
      findUnique: vi.fn().mockResolvedValue(event),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateManyAndReturn: vi.fn().mockResolvedValue([{ attempts: event.attempts + 1 }]),
    },
    $queryRaw: vi.fn(),
  };
  return { database, event };
}

describe('order outbox processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reivindica, publica e conclui um evento uma única vez', async () => {
    const { database } = createDatabase();
    const publisher = { publish: vi.fn().mockResolvedValue(undefined) };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        1,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'ack', eventId });

    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: eventId, eventType: 'ORDER_ACCEPTED', payload }),
    );
    expect(database.orderOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
    );
  });

  it('ignora entrega duplicada de evento já processado', async () => {
    const { database } = createDatabase({ status: 'PROCESSED' });
    const publisher = { publish: vi.fn() };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        1,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'ack', eventId });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('reagenda com backoff quando a publicação falha antes do limite', async () => {
    const { database } = createDatabase({ attempts: 1 });
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('Pusher unavailable')) };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        2,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'retry', delaySeconds: 10, eventId });
    expect(database.orderOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PROCESSING',
          availableAt: expect.any(Date),
          lastError: 'Pusher unavailable',
        }),
      }),
    );
  });

  it('marca falha terminal após o limite de tentativas', async () => {
    const { database } = createDatabase({ attempts: 4 });
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('Pusher unavailable')) };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        5,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'dead-letter', eventId });
    expect(database.orderOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('não envia à DLQ quando perde o lease e outro worker conclui o evento', async () => {
    const { database, event } = createDatabase({ attempts: 4 });
    database.orderOutboxEvent.findUnique
      .mockResolvedValueOnce(event)
      .mockResolvedValueOnce({ status: 'PROCESSED' });
    database.orderOutboxEvent.updateMany.mockResolvedValue({ count: 0 });
    const publisher = { publish: vi.fn().mockRejectedValue(new Error('late failure')) };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        5,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'ack', eventId });
  });

  it('rejeita evento persistido com versão de schema incompatível', async () => {
    const { database } = createDatabase({ schemaVersion: 2, attempts: 4 });
    const publisher = { publish: vi.fn() };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        5,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'dead-letter', eventId });
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(database.orderOutboxEvent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('envia lotes vencidos ao relay e libera os locks após enqueue', async () => {
    const secondEventId = '00000000-0000-4000-8000-000000000004';
    const { database } = createDatabase();
    database.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: eventId }, { id: secondEventId }]);
    database.orderOutboxEvent.updateMany.mockResolvedValue({ count: 2 });
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const deadLetterSendBatch = vi.fn();

    await expect(
      relayPendingOrderOutboxEvents(
        database as never,
        { sendBatch } as never,
        { sendBatch: deadLetterSendBatch } as never,
      ),
    ).resolves.toEqual({ claimed: 2, enqueued: 2, deadLettered: 0 });

    expect(sendBatch).toHaveBeenCalledWith([
      { body: { schemaVersion: 1, eventId }, contentType: 'json' },
      { body: { schemaVersion: 1, eventId: secondEventId }, contentType: 'json' },
    ]);
    expect(database.orderOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lockToken: null }) }),
    );
    expect(database.$queryRaw.mock.calls[1]?.[0].strings.join(' ')).toContain('"queuedAt" IS NULL');
    expect(deadLetterSendBatch).not.toHaveBeenCalled();
  });

  it('move leases esgotados e abandonados para a DLQ pelo relay', async () => {
    const { database } = createDatabase();
    database.$queryRaw.mockResolvedValueOnce([{ id: eventId }]).mockResolvedValueOnce([]);
    const deadLetterSendBatch = vi.fn().mockResolvedValue(undefined);

    await expect(
      relayPendingOrderOutboxEvents(
        database as never,
        { sendBatch: vi.fn() } as never,
        { sendBatch: deadLetterSendBatch } as never,
      ),
    ).resolves.toEqual({ claimed: 0, enqueued: 0, deadLettered: 1 });
    expect(deadLetterSendBatch).toHaveBeenCalledWith([
      { body: { eventId, schemaVersion: 1 }, contentType: 'json' },
    ]);
    expect(database.orderOutboxEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('continua o relay normal quando a DLQ está indisponível', async () => {
    const secondEventId = '00000000-0000-4000-8000-000000000004';
    const { database } = createDatabase();
    database.$queryRaw
      .mockResolvedValueOnce([{ id: eventId }])
      .mockResolvedValueOnce([{ id: secondEventId }]);
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const deadLetterSendBatch = vi.fn().mockRejectedValue(new Error('DLQ unavailable'));

    await expect(
      relayPendingOrderOutboxEvents(
        database as never,
        { sendBatch } as never,
        { sendBatch: deadLetterSendBatch } as never,
      ),
    ).resolves.toEqual({ claimed: 1, enqueued: 1, deadLettered: 0 });
    expect(sendBatch).toHaveBeenCalledWith([
      { body: { eventId: secondEventId, schemaVersion: 1 }, contentType: 'json' },
    ]);
  });

  it('respeita o backoff persistido sem consumir outra tentativa', async () => {
    const { database } = createDatabase({
      availableAt: new Date(Date.now() + 30_000),
    });
    const publisher = { publish: vi.fn() };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        1,
        'message-a',
      ),
    ).resolves.toMatchObject({ action: 'retry', eventId });
    expect(database.orderOutboxEvent.updateManyAndReturn).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('encaminha novamente um evento FAILED para a DLQ sem publicar', async () => {
    const { database } = createDatabase({ status: 'FAILED' });
    const publisher = { publish: vi.fn() };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        1,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'dead-letter', eventId });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('não rouba um quinto attempt com lease ainda ativo', async () => {
    const { database } = createDatabase({ attempts: 5, lockedAt: new Date() });
    database.orderOutboxEvent.updateManyAndReturn.mockResolvedValue([]);
    const publisher = { publish: vi.fn() };

    await expect(
      processOrderOutboxMessage(
        database as never,
        publisher,
        { schemaVersion: 1, eventId },
        1,
        'message-a',
      ),
    ).resolves.toEqual({ action: 'retry', delaySeconds: 5, eventId });
    expect(database.orderOutboxEvent.updateMany).not.toHaveBeenCalled();
  });
});
