import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOrder } from '@/server/repositories/order.repository';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    orderOutboxEvent: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));

const params = {
  input: {
    customerName: 'Cliente',
    customerPhone: '(85) 99999-9999',
    modality: 'PICKUP' as const,
    paymentMethod: 'PIX' as const,
    notes: '',
    idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
    items: [
      {
        productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
        quantity: 1,
        notes: '',
        optionIds: [],
      },
    ],
  },
  storeId: 'store-a',
  tenantId: 'tenant-a',
  resolvedItems: [
    {
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      productName: 'Produto',
      basePrice: 2000,
      quantity: 1,
      notes: '',
      options: [],
      unitPrice: 2000,
      itemTotal: 2000,
    },
  ],
  deliveryFee: 0,
  deliveryZoneName: null,
  subtotal: 2000,
  total: 2000,
  idempotencyFingerprint: 'fingerprint-a',
};

describe('OrderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.order.findUnique.mockResolvedValue(null);
    mocks.tx.order.create.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      createdAt: new Date('2026-07-22T10:00:00.000Z'),
      payment: { id: 'payment-a' },
    });
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'audit-a' });
    mocks.tx.orderOutboxEvent.create.mockResolvedValue({ id: 'outbox-a' });
  });

  it('cria auditoria na mesma transação somente para pedido novo', async () => {
    const result = await createOrder(params);

    expect(result).toEqual({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      created: true,
      outboxEventIds: ['outbox-a'],
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ORDER_CREATED', entityId: 'order-a' }),
      }),
    );
    expect(mocks.tx.orderOutboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditLogId: 'audit-a',
          eventType: 'ORDER_CREATED',
          aggregateVersion: 0,
        }),
      }),
    );
    expect(mocks.tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusHistory: {
            create: expect.objectContaining({ versionFrom: null, versionTo: 0 }),
          },
        }),
      }),
    );
    expect(mocks.tx.order.create.mock.calls[0][0].data).not.toHaveProperty('orderNumber');
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.$executeRaw.mock.calls[0][1]).toBe(`store-a:${params.input.idempotencyKey}`);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.order.findUnique.mock.invocationCallOrder[0],
    );
  });

  it('retorna pedido idempotente sem criar nova auditoria', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      idempotencyFingerprint: 'fingerprint-a',
    });

    const result = await createOrder(params);

    expect(result.created).toBe(false);
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.tx.orderOutboxEvent.create).not.toHaveBeenCalled();
  });

  it('rejeita reuso da chave idempotente com payload diferente', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      idempotencyFingerprint: 'fingerprint-b',
    });

    await expect(createOrder(params)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
  });

  it('não retorna sucesso quando a auditoria falha', async () => {
    mocks.tx.auditLog.create.mockRejectedValue(new Error('audit unavailable'));

    await expect(createOrder(params)).rejects.toThrow('audit unavailable');
  });
});
