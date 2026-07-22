import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addOrderInternalNote,
  getOrderInternalNotes,
} from '@/server/services/order-internal-note.service';

const mocks = vi.hoisted(() => ({
  orderFindFirst: vi.fn(),
  orderUpdateMany: vi.fn(),
  noteCreate: vi.fn(),
  noteFindMany: vi.fn(),
  auditCreate: vi.fn(),
  outboxCreate: vi.fn(),
}));

const transactionClient = {
  order: { findFirst: mocks.orderFindFirst, updateMany: mocks.orderUpdateMany },
  orderInternalNote: { create: mocks.noteCreate },
  auditLog: { create: mocks.auditCreate },
  orderOutboxEvent: { create: mocks.outboxCreate },
};

vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    order: { findFirst: mocks.orderFindFirst },
    orderInternalNote: { findMany: mocks.noteFindMany },
    $transaction: (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
  }),
}));

const context = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  userId: 'user-a',
  userName: 'Atendente',
  canConfirmPayment: false,
  canRefundPayment: false,
};

const order = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  storeId: 'store-a',
  orderNumber: 42,
  status: 'PREPARING' as const,
  paymentStatus: 'PENDING' as const,
  version: 3,
};

describe('observações internas do pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderFindFirst.mockResolvedValue(order);
    mocks.orderUpdateMany.mockResolvedValue({ count: 1 });
    mocks.noteCreate.mockResolvedValue({ id: 'note-a' });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-a' });
    mocks.outboxCreate.mockResolvedValue({ id: 'outbox-a' });
  });

  it('grava nota, versão, auditoria e outbox na mesma transação sem copiar o texto no audit log', async () => {
    const result = await addOrderInternalNote(context, {
      orderId: order.id,
      expectedVersion: 3,
      body: 'Confirmar retirada com o cliente.',
    });

    expect(mocks.orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: order.id,
          tenantId: 'tenant-a',
          storeId: 'store-a',
          version: 3,
        }),
      }),
    );
    expect(mocks.noteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          orderId: order.id,
          authorUserId: 'user-a',
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_INTERNAL_NOTE_ADDED',
          metadata: expect.objectContaining({ orderId: order.id, bodyLength: 33 }),
        }),
      }),
    );
    expect(JSON.stringify(mocks.auditCreate.mock.calls)).not.toContain(
      'Confirmar retirada com o cliente.',
    );
    expect(mocks.outboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'ORDER_INTERNAL_NOTE_ADDED',
          aggregateVersion: 4,
        }),
      }),
    );
    expect(result).toMatchObject({ noteId: 'note-a', version: 4, outboxEventIds: ['outbox-a'] });
  });

  it('rejeita versão antiga antes de criar nota ou auditoria', async () => {
    await expect(
      addOrderInternalNote(context, {
        orderId: order.id,
        expectedVersion: 2,
        body: 'Nota concorrente',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(mocks.orderUpdateMany).not.toHaveBeenCalled();
    expect(mocks.noteCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('lista notas somente depois de validar o pedido no tenant e na loja', async () => {
    mocks.orderFindFirst.mockResolvedValue({ id: order.id });
    mocks.noteFindMany.mockResolvedValue([
      {
        id: 'note-a',
        body: 'Somente equipe',
        createdAt: new Date('2026-07-22T12:00:00.000Z'),
        author: { name: 'Atendente' },
      },
    ]);

    const result = await getOrderInternalNotes(context, order.id, { pageSize: 20 });

    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: order.id, tenantId: 'tenant-a', storeId: 'store-a' },
      }),
    );
    expect(mocks.noteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          orderId: order.id,
          deletedAt: null,
        }),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ body: 'Somente equipe', authorName: 'Atendente' }),
    );
  });
});
