import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  createDatabaseClient: vi.fn(),
  createOrderEventPublisher: vi.fn(),
  processOrderOutboxMessage: vi.fn(),
  relayPendingOrderOutboxEvents: vi.fn(),
}));

vi.mock('@/server/database/factory', () => ({
  createDatabaseClient: mocks.createDatabaseClient,
}));
vi.mock('@/lib/pusher/order-event-publisher', () => ({
  createOrderEventPublisher: mocks.createOrderEventPublisher,
}));
vi.mock('@/server/services/order-outbox-processor', () => ({
  processOrderOutboxMessage: mocks.processOrderOutboxMessage,
  relayPendingOrderOutboxEvents: mocks.relayPendingOrderOutboxEvents,
}));

import worker from '../../workers/order-events/worker';

const eventId = '00000000-0000-4000-8000-000000000001';

function environment() {
  return {
    HYPERDRIVE: { connectionString: 'postgresql://local' },
    ORDER_OUTBOX_QUEUE: { sendBatch: vi.fn() },
    ORDER_OUTBOX_DLQ: { send: vi.fn().mockResolvedValue(undefined) },
    PUSHER_APP_ID: 'app',
    PUSHER_KEY: 'key',
    PUSHER_SECRET: 'secret',
    PUSHER_CLUSTER: 'cluster',
  };
}

function batch() {
  const message = {
    id: 'message-a',
    body: { eventId, schemaVersion: 1 },
    attempts: 5,
    ack: vi.fn(),
    retry: vi.fn(),
  };
  return { messages: [message], message, retryAll: vi.fn() };
}

describe('order events worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.createDatabaseClient.mockReturnValue({ $disconnect: mocks.disconnect });
    mocks.createOrderEventPublisher.mockReturnValue({ publish: vi.fn() });
  });

  it('envia falha terminal explicitamente à DLQ antes de confirmar', async () => {
    const env = environment();
    const input = batch();
    mocks.processOrderOutboxMessage.mockResolvedValue({ action: 'dead-letter', eventId });

    await worker.queue(input as never, env as never);

    expect(env.ORDER_OUTBOX_DLQ.send).toHaveBeenCalledWith(input.message.body, {
      contentType: 'json',
    });
    expect(input.message.ack).toHaveBeenCalledOnce();
    expect(input.message.retry).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('mantém a mensagem sem ack quando o envio à DLQ falha', async () => {
    const env = environment();
    const input = batch();
    env.ORDER_OUTBOX_DLQ.send.mockRejectedValue(new Error('DLQ unavailable'));
    mocks.processOrderOutboxMessage.mockResolvedValue({ action: 'dead-letter', eventId });

    await worker.queue(input as never, env as never);

    expect(input.message.ack).not.toHaveBeenCalled();
    expect(input.message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it('reagenda o lote quando a configuração obrigatória está ausente', async () => {
    const env = environment();
    const input = batch();
    env.PUSHER_SECRET = '';

    await worker.queue(input as never, env as never);

    expect(input.retryAll).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(mocks.processOrderOutboxMessage).not.toHaveBeenCalled();
  });
});
