import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  createDatabaseClient: vi.fn(),
  createOrderEventPublisher: vi.fn(),
  processOrderOutboxMessage: vi.fn(),
  relayPendingOrderOutboxEvents: vi.fn(),
  purgeProcessedOrderOutboxEvents: vi.fn(),
  projectWebPushDispatch: vi.fn(),
  reconcileWebPushDispatches: vi.fn(),
  processPendingWebPushDeliveries: vi.fn(),
  processWebPushDeliveriesForEvent: vi.fn(),
  projectStoreWebPushDispatch: vi.fn(),
  reconcileStoreWebPushDispatches: vi.fn(),
  processPendingStoreWebPushDeliveries: vi.fn(),
  processStoreWebPushDeliveriesForEvent: vi.fn(),
  sendStoreStaffPushTest: vi.fn(),
  revokeExpiredWebPushSubscriptions: vi.fn(),
  readWebPushSenderConfig: vi.fn(),
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
vi.mock('@/server/services/order-outbox-retention', () => ({
  purgeProcessedOrderOutboxEvents: mocks.purgeProcessedOrderOutboxEvents,
}));
vi.mock('@/server/services/web-push-dispatch.service', () => ({
  projectWebPushDispatch: mocks.projectWebPushDispatch,
  reconcileWebPushDispatches: mocks.reconcileWebPushDispatches,
}));
vi.mock('@/server/services/web-push-delivery.service', () => ({
  processPendingWebPushDeliveries: mocks.processPendingWebPushDeliveries,
  processWebPushDeliveriesForEvent: mocks.processWebPushDeliveriesForEvent,
}));
vi.mock('@/server/services/store-web-push-dispatch.service', () => ({
  projectStoreWebPushDispatch: mocks.projectStoreWebPushDispatch,
  reconcileStoreWebPushDispatches: mocks.reconcileStoreWebPushDispatches,
}));
vi.mock('@/server/services/store-web-push-delivery.service', () => ({
  processPendingStoreWebPushDeliveries: mocks.processPendingStoreWebPushDeliveries,
  processStoreWebPushDeliveriesForEvent: mocks.processStoreWebPushDeliveriesForEvent,
  sendStoreStaffPushTest: mocks.sendStoreStaffPushTest,
}));
vi.mock('@/server/services/web-push-revocation.service', () => ({
  revokeExpiredWebPushSubscriptions: mocks.revokeExpiredWebPushSubscriptions,
}));
vi.mock('@/server/services/web-push-sender', () => ({
  readWebPushSenderConfig: mocks.readWebPushSenderConfig,
}));

import worker from '../../workers/order-events/worker';

const eventId = '00000000-0000-4000-8000-000000000001';
const secondEventId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000010';

function database() {
  return {
    $disconnect: mocks.disconnect,
    order: { findUnique: vi.fn().mockResolvedValue({ publicToken: 'public-token' }) },
    orderOutboxEvent: {
      findMany: vi.fn().mockResolvedValue([{ id: eventId, orderId, aggregateVersion: 1 }]),
    },
  };
}

function environment() {
  return {
    HYPERDRIVE: { connectionString: 'postgresql://local' },
    ORDER_OUTBOX_QUEUE: { sendBatch: vi.fn() },
    ORDER_OUTBOX_DLQ: { send: vi.fn().mockResolvedValue(undefined) },
    PUSHER_APP_ID: 'app',
    PUSHER_KEY: 'key',
    PUSHER_SECRET: 'secret',
    PUSHER_CLUSTER: 'cluster',
    ORDER_OUTBOX_RELAY_ENABLED: 'false',
    ORDER_OUTBOX_RETENTION_ENABLED: 'false',
    ORDER_OUTBOX_RETENTION_DAYS: '30',
  };
}

function queueMessage(id: string, queueEventId: string) {
  return {
    id,
    body: { eventId: queueEventId, schemaVersion: 1 },
    attempts: 5,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function batch() {
  const message = queueMessage('message-a', eventId);
  return { messages: [message], message, retryAll: vi.fn() };
}

describe('order events worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.disconnect.mockResolvedValue(undefined);
    mocks.createDatabaseClient.mockReturnValue(database());
    mocks.createOrderEventPublisher.mockReturnValue({ publish: vi.fn() });
    mocks.purgeProcessedOrderOutboxEvents.mockResolvedValue({
      deleted: 0,
      retentionDays: 30,
    });
    mocks.projectWebPushDispatch.mockResolvedValue({ projected: true, deliveries: 1 });
    mocks.processWebPushDeliveriesForEvent.mockResolvedValue({
      candidates: 1,
      outcomes: { sent: 1 },
    });
    mocks.projectStoreWebPushDispatch.mockResolvedValue({ projected: true, deliveries: 1 });
    mocks.processStoreWebPushDeliveriesForEvent.mockResolvedValue({
      candidates: 1,
      outcomes: { sent: 1 },
    });
    mocks.revokeExpiredWebPushSubscriptions.mockResolvedValue({ revoked: 0 });
    mocks.readWebPushSenderConfig.mockReturnValue(null);
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

  it('processa versões do mesmo pedido em ordem, mesmo quando o lote chega invertido', async () => {
    const db = database();
    db.orderOutboxEvent.findMany.mockResolvedValue([
      { id: eventId, orderId, aggregateVersion: 1 },
      { id: secondEventId, orderId, aggregateVersion: 2 },
    ]);
    mocks.createDatabaseClient.mockReturnValue(db);
    const first = queueMessage('message-v2', secondEventId);
    const second = queueMessage('message-v1', eventId);
    const processed: string[] = [];
    mocks.processOrderOutboxMessage.mockImplementation(async (_db, _publisher, body) => {
      processed.push(body.eventId);
      return { action: 'ack', eventId: body.eventId };
    });

    await worker.queue(
      { messages: [first, second], retryAll: vi.fn() } as never,
      environment() as never,
    );

    expect(processed).toEqual([eventId, secondEventId]);
    expect(first.ack).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
  });

  it('não ultrapassa uma versão do agregado que precisa ser reprocessada', async () => {
    const db = database();
    db.orderOutboxEvent.findMany.mockResolvedValue([
      { id: eventId, orderId, aggregateVersion: 1 },
      { id: secondEventId, orderId, aggregateVersion: 2 },
    ]);
    mocks.createDatabaseClient.mockReturnValue(db);
    const first = queueMessage('message-v1', eventId);
    const second = queueMessage('message-v2', secondEventId);
    mocks.processOrderOutboxMessage.mockResolvedValue({
      action: 'retry',
      eventId,
      delaySeconds: 10,
    });

    await worker.queue(
      { messages: [first, second], retryAll: vi.fn() } as never,
      environment() as never,
    );

    expect(mocks.processOrderOutboxMessage).toHaveBeenCalledOnce();
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
    expect(second.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
  });

  it('envia Web Push antes do Pusher e mesmo quando o outbox precisa de retry', async () => {
    const env = { ...environment(), WEB_PUSH_ENABLED: 'true' };
    const input = batch();
    const senderConfig = {
      publicKey: 'public',
      privateKey: 'private',
      subject: 'mailto:test@test',
    };
    mocks.readWebPushSenderConfig.mockReturnValue(senderConfig);
    mocks.processOrderOutboxMessage.mockResolvedValue({
      action: 'retry',
      eventId,
      delaySeconds: 10,
    });

    await worker.queue(input as never, env as never);

    expect(mocks.projectWebPushDispatch).toHaveBeenCalledWith(expect.anything(), eventId);
    expect(mocks.processWebPushDeliveriesForEvent).toHaveBeenCalledWith(
      expect.anything(),
      senderConfig,
      eventId,
    );
    expect(mocks.processWebPushDeliveriesForEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processOrderOutboxMessage.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(input.message.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
  });

  it('mantÃ©m Merchant Push independente do consumidor e do Pusher', async () => {
    const env = { ...environment(), MERCHANT_WEB_PUSH_ENABLED: 'true' };
    const input = batch();
    const senderConfig = {
      publicKey: 'public',
      privateKey: 'private',
      subject: 'mailto:test@test',
    };
    mocks.readWebPushSenderConfig.mockReturnValue(senderConfig);
    mocks.projectStoreWebPushDispatch.mockRejectedValue(new Error('merchant unavailable'));
    mocks.processOrderOutboxMessage.mockResolvedValue({ action: 'ack', eventId });

    await worker.queue(input as never, env as never);

    expect(mocks.projectStoreWebPushDispatch).toHaveBeenCalledWith(expect.anything(), eventId);
    expect(mocks.projectWebPushDispatch).not.toHaveBeenCalled();
    expect(mocks.processOrderOutboxMessage).toHaveBeenCalledOnce();
    expect(input.message.ack).toHaveBeenCalledOnce();
  });

  it('limita o paralelismo entre pedidos independentes', async () => {
    const ids = [1, 2, 3, 4].map((suffix) => `00000000-0000-4000-8000-00000000000${suffix}`);
    const db = database();
    db.orderOutboxEvent.findMany.mockResolvedValue(
      ids.map((id, index) => ({
        id,
        orderId: `00000000-0000-4000-8000-00000000001${index}`,
        aggregateVersion: 1,
      })),
    );
    mocks.createDatabaseClient.mockReturnValue(db);
    let active = 0;
    let maximumActive = 0;
    mocks.processOrderOutboxMessage.mockImplementation(async (_db, _publisher, body) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { action: 'ack', eventId: body.eventId };
    });

    await worker.queue(
      {
        messages: ids.map((id, index) => queueMessage(`message-${index}`, id)),
        retryAll: vi.fn(),
      } as never,
      environment() as never,
    );

    expect(maximumActive).toBe(3);
  });

  it('reutiliza a consulta do token público para eventos do mesmo pedido no lote', async () => {
    const db = database();
    mocks.createDatabaseClient.mockReturnValue(db);
    mocks.processOrderOutboxMessage.mockResolvedValue({ action: 'ack', eventId });

    await worker.queue(batch() as never, environment() as never);
    const config = mocks.createOrderEventPublisher.mock.calls[0]?.[0] as {
      resolvePublicToken(orderId: string): Promise<string | null>;
    };
    await Promise.all([config.resolvePublicToken(orderId), config.resolvePublicToken(orderId)]);

    expect(db.order.findUnique).toHaveBeenCalledOnce();
  });

  it('executa uma retenção pequena somente na janela horária prevista', async () => {
    const env = environment();
    env.ORDER_OUTBOX_RETENTION_ENABLED = 'true';

    await worker.scheduled({ scheduledTime: Date.UTC(2026, 6, 31, 9, 17) } as never, env as never);

    expect(mocks.purgeProcessedOrderOutboxEvents).toHaveBeenCalledWith(expect.anything(), {
      retentionDays: 30,
    });
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('não abre conexão de retenção fora da janela horária', async () => {
    const env = environment();
    env.ORDER_OUTBOX_RETENTION_ENABLED = 'true';

    await worker.scheduled({ scheduledTime: Date.UTC(2026, 6, 31, 9, 18) } as never, env as never);

    expect(mocks.createDatabaseClient).not.toHaveBeenCalled();
    expect(mocks.purgeProcessedOrderOutboxEvents).not.toHaveBeenCalled();
  });
});
