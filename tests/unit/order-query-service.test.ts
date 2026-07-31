import { beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeOrderCursor, encodeOrderCursor } from '@/lib/orders/cursor';
import {
  getDailyOrderMetrics,
  getActiveOrderCounts,
  getOrderBoardLane,
  getOrderBoardBootstrap,
  getOrderBoardSnapshot,
  getOrderBoardTemporalSummary,
  getOrderDetails,
  getOrderHistory,
  getOrderNotificationSignals,
  getOrderQueue,
  type OrderQueryContext,
} from '@/server/services/order-query.service';

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  orderFindFirst: vi.fn(),
  orderCount: vi.fn(),
  orderGroupBy: vi.fn(),
  orderAggregate: vi.fn(),
  historyFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  paymentHistoryFindMany: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/server/database/client', () => {
  const database = {
    order: {
      findMany: mocks.orderFindMany,
      findFirst: mocks.orderFindFirst,
      count: mocks.orderCount,
      groupBy: mocks.orderGroupBy,
      aggregate: mocks.orderAggregate,
    },
    orderStatusHistory: { findMany: mocks.historyFindMany },
    auditLog: {
      findMany: mocks.auditFindMany,
    },
    paymentStatusHistory: { findMany: mocks.paymentHistoryFindMany },
    $queryRaw: mocks.queryRaw,
  };
  mocks.transaction.mockImplementation((operation: (client: typeof database) => Promise<unknown>) =>
    operation(database),
  );
  return {
    getDb: () => ({ ...database, $transaction: mocks.transaction }),
  };
});

const context: OrderQueryContext = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  timeZone: 'America/Fortaleza',
  userId: 'user-a',
  tenantRole: 'ATTENDANT',
  estimatedTimeMaxMinutes: 50,
};

function queueOrder(id: string, createdAt: string) {
  return {
    id,
    orderNumber: Number(id.slice(-1)) || 1,
    customerName: 'Cliente',
    modality: 'PICKUP',
    paymentMethod: 'PIX',
    paymentStatus: 'PENDING',
    status: 'PENDING',
    total: 2500,
    createdAt: new Date(createdAt),
    statusChangedAt: new Date(createdAt),
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    promisedFulfillmentMinAt: new Date('2026-07-21T13:30:00.000Z'),
    promisedFulfillmentMaxAt: new Date('2026-07-21T14:00:00.000Z'),
    version: 0,
    notes: null,
    _count: { items: 2 },
    items: [],
  };
}

function historyEntry(id = 'history-a') {
  return {
    id,
    fromStatus: 'PREPARING',
    toStatus: 'READY',
    actorNameSnapshot: 'Atendente',
    changedById: 'user-a',
    source: 'DASHBOARD',
    reasonCode: null,
    note: null,
    isUndo: false,
    versionFrom: 2,
    versionTo: 3,
    createdAt: new Date(),
  };
}

describe('OrderQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditFindMany.mockResolvedValue([]);
    mocks.paymentHistoryFindMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([{ watermark: new Date('2026-07-21T12:00:00.000Z') }]);
  });

  it('retorna DTO resumido, limite e cursor estável sem PII', async () => {
    mocks.orderFindMany.mockResolvedValue([
      queueOrder('order-2', '2026-07-21T13:00:00.000Z'),
      queueOrder('order-1', '2026-07-21T12:00:00.000Z'),
    ]);
    mocks.orderCount.mockResolvedValue(501);

    const result = await getOrderQueue(context, { date: '2026-07-21', pageSize: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ itemCount: 2, customerDisplayName: 'Cliente' }),
    );
    expect(result.items[0]).not.toHaveProperty('customerPhone');
    expect(result.items[0]).not.toHaveProperty('deliveryAddress');
    expect(result.hasAbnormalActiveVolume).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeOrderCursor(result.nextCursor!)).toEqual({
      createdAt: new Date('2026-07-21T13:00:00.000Z'),
      id: 'order-2',
    });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      }),
    );
  });

  it('monta o board com totais exatos, quatro colunas e dez itens iniciais', async () => {
    mocks.orderGroupBy
      .mockResolvedValueOnce([
        { status: 'PENDING', _count: { _all: 11 } },
        { status: 'CONFIRMED', _count: { _all: 3 } },
        { status: 'PREPARING', _count: { _all: 4 } },
        { status: 'READY', _count: { _all: 5 } },
        { status: 'OUT_FOR_DELIVERY', _count: { _all: 6 } },
      ])
      .mockResolvedValueOnce([
        { status: 'PENDING', _count: { _all: 11 } },
        { status: 'CONFIRMED', _count: { _all: 3 } },
        { status: 'PREPARING', _count: { _all: 4 } },
        { status: 'READY', _count: { _all: 5 } },
        { status: 'OUT_FOR_DELIVERY', _count: { _all: 6 } },
      ])
      .mockResolvedValueOnce([
        { status: 'DELIVERED', _count: { _all: 7 } },
        { status: 'CANCELLED', _count: { _all: 1 } },
      ]);
    mocks.orderCount.mockResolvedValue(3);
    const newOrder = {
      ...queueOrder('order-1', '2026-07-21T12:00:00.000Z'),
      items: [{ id: 'item-a', productName: 'X-Burguer', quantity: 2, notes: 'Sem cebola' }],
    };
    mocks.orderFindMany
      .mockResolvedValueOnce([
        newOrder,
        ...Array.from({ length: 10 }, (_, index) =>
          queueOrder(
            `order-${index + 2}`,
            `2026-07-21T${String(index + 13).padStart(2, '0')}:00:00.000Z`,
          ),
        ),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getOrderBoardSnapshot(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: false,
    });

    expect(result.summary).toEqual({
      newCount: 11,
      preparingCount: 7,
      readyCount: 5,
      deliveryCount: 6,
      delayedCount: 3,
    });
    expect(Object.keys(result.lanes)).toEqual([
      'NEW',
      'PREPARATION',
      'READY_AND_DELIVERY',
      'FINISHED',
    ]);
    expect(result.lanes.NEW).toMatchObject({ total: 11, key: 'NEW' });
    expect(result.lanes.NEW.items).toHaveLength(10);
    expect(result.lanes.NEW.nextCursor).not.toBeNull();
    expect(result.lanes.PREPARATION.total).toBe(7);
    expect(result.lanes.READY_AND_DELIVERY.total).toBe(11);
    expect(result.lanes.FINISHED.total).toBe(8);
    expect(result.lanes.NEW.items[0]).toMatchObject({
      itemPreview: [{ id: 'item-a', productName: 'X-Burguer', quantity: 2, notes: 'Sem cebola' }],
      promisedFulfillmentMinAt: '2026-07-21T13:30:00.000Z',
      promisedFulfillmentMaxAt: '2026-07-21T14:00:00.000Z',
    });
    expect(result.lanes.NEW.items[0]).not.toHaveProperty('customerPhone');
    expect(result.lanes.NEW.items[0]).not.toHaveProperty('deliveryAddress');
    expect(mocks.orderFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        take: 11,
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          status: { in: ['PENDING'] },
        }),
      }),
    );
    expect(mocks.orderFindMany).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          status: { in: ['DELIVERED', 'CANCELLED'] },
          AND: [
            {
              statusChangedAt: {
                gte: new Date('2026-07-21T03:00:00.000Z'),
                lt: new Date('2026-07-22T03:00:00.000Z'),
              },
            },
          ],
        }),
      }),
    );
  });

  it('carrega board e baseline no mesmo snapshot autoritativo do banco', async () => {
    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-existing',
        createdAt: new Date('2026-07-21T12:00:01.000Z'),
      },
    ]);
    mocks.orderGroupBy
      .mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 1 } }])
      .mockResolvedValueOnce([]);
    mocks.orderCount.mockResolvedValue(0);
    mocks.orderFindMany.mockResolvedValue([]);

    const result = await getOrderBoardBootstrap(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: false,
    });

    expect(result.initialBoard.summary.newCount).toBe(1);
    expect(result.notificationBaseline.processedEventIds).toEqual(['audit-existing']);
    expect(decodeOrderCursor(result.notificationBaseline.nextCursor)).toEqual({
      createdAt: new Date('2026-07-21T12:00:01.000Z'),
      id: 'audit-existing',
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 250,
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          createdAt: { gte: new Date('2026-07-21T11:55:00.000Z') },
        }),
      }),
    );
  });

  it.each(['FAILED', 'CANCELLED', 'REFUNDED'] as const)(
    'não oferece confirmação de pagamento impossível para PIX %s',
    async (paymentStatus) => {
      mocks.orderFindMany.mockResolvedValue([
        {
          ...queueOrder('order-1', '2026-07-21T12:00:00.000Z'),
          status: 'READY',
          paymentStatus,
        },
      ]);
      mocks.orderCount.mockResolvedValue(1);

      const result = await getOrderBoardLane(context, {
        localDate: '2026-07-21',
        onlyActive: false,
        delayedOnly: false,
        lane: 'READY_AND_DELIVERY',
        pageSize: 10,
      });

      expect(result.items[0]?.nextActionLabel).toBeNull();
    },
  );

  it('atualiza somente o resumo temporal sem recarregar as quatro colunas', async () => {
    mocks.orderCount.mockResolvedValue(4);

    const result = await getOrderBoardTemporalSummary(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: false,
      modality: 'DELIVERY',
    });

    expect(result).toEqual({ delayedCount: 4, asOf: '2026-07-21T12:00:00.000Z' });
    expect(mocks.orderCount).toHaveBeenCalledTimes(1);
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
    expect(mocks.orderGroupBy).not.toHaveBeenCalled();
    expect(mocks.orderCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        modality: 'DELIVERY',
      }),
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('pagina cada coluna com cursor e total próprios', async () => {
    mocks.orderFindMany.mockResolvedValue([
      queueOrder('order-1', '2026-07-21T12:00:00.000Z'),
      queueOrder('order-2', '2026-07-21T13:00:00.000Z'),
      queueOrder('order-3', '2026-07-21T14:00:00.000Z'),
    ]);
    mocks.orderCount.mockResolvedValue(12);

    const result = await getOrderBoardLane(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: false,
      lane: 'PREPARATION',
      pageSize: 2,
    });

    expect(result.key).toBe('PREPARATION');
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(12);
    expect(result.nextCursor).not.toBeNull();
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          status: { in: ['CONFIRMED', 'PREPARING'] },
        }),
      }),
    );
    expect(mocks.orderCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        status: { in: ['CONFIRMED', 'PREPARING'] },
      }),
    });
  });

  it('usa a data de finalização, não a criação, na coluna de finalizados', async () => {
    const finishedYesterdayCreatedTodayChanged = {
      ...queueOrder('order-9', '2026-07-20T12:00:00.000Z'),
      status: 'DELIVERED' as const,
      statusChangedAt: new Date('2026-07-21T12:00:00.000Z'),
      deliveredAt: new Date('2026-07-21T12:00:00.000Z'),
    };
    mocks.orderFindMany.mockResolvedValue([
      finishedYesterdayCreatedTodayChanged,
      {
        ...finishedYesterdayCreatedTodayChanged,
        id: 'order-8',
        statusChangedAt: new Date('2026-07-21T11:00:00.000Z'),
      },
    ]);
    mocks.orderCount.mockResolvedValue(2);

    const result = await getOrderBoardLane(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: false,
      lane: 'FINISHED',
      pageSize: 1,
    });

    expect(result.items[0]?.id).toBe('order-9');
    expect(decodeOrderCursor(result.nextCursor!)).toEqual({
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
      id: 'order-9',
    });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        where: expect.objectContaining({
          AND: [
            {
              statusChangedAt: {
                gte: new Date('2026-07-21T03:00:00.000Z'),
                lt: new Date('2026-07-22T03:00:00.000Z'),
              },
            },
          ],
        }),
      }),
    );
  });

  it('filtra atrasos apenas por alertas operacionais e oculta finalizados', async () => {
    mocks.orderGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.orderCount.mockResolvedValue(4);
    mocks.orderFindMany.mockResolvedValue([]);

    const result = await getOrderBoardSnapshot(context, {
      localDate: '2026-07-21',
      onlyActive: false,
      delayedOnly: true,
    });

    expect(result.lanes.FINISHED).toEqual({
      key: 'FINISHED',
      items: [],
      total: 0,
      nextCursor: null,
    });
    const delayedWhere = mocks.orderCount.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(delayedWhere)).not.toContain('CUSTOMER_REPORTED_PAID');
    expect(JSON.stringify(delayedWhere)).not.toContain('paymentStatus');
    expect(JSON.stringify(delayedWhere)).toContain('OUT_FOR_DELIVERY');
    expect(mocks.orderFindMany).toHaveBeenCalledTimes(3);
  });

  it('cria baseline sem notificar pedidos já existentes', async () => {
    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-existing',
        createdAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    ]);

    const result = await getOrderNotificationSignals(context);

    expect(result.items).toEqual([]);
    expect(result.processedEventIds).toEqual(['audit-existing']);
    expect(decodeOrderCursor(result.nextCursor)).toEqual(
      expect.objectContaining({
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      }),
    );
  });

  it('retorna novos sinais em ordem crescente e isolados por loja', async () => {
    mocks.auditFindMany.mockResolvedValueOnce([
      {
        id: 'audit-1',
        createdAt: new Date('2026-07-21T12:00:00.000Z'),
      },
    ]);
    const baseline = await getOrderNotificationSignals(context);
    mocks.auditFindMany.mockResolvedValueOnce([
      {
        id: 'audit-2',
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: 'order-2',
        metadata: null,
        createdAt: new Date('2026-07-21T12:01:00.000Z'),
      },
    ]);
    mocks.orderFindMany.mockResolvedValue([{ id: 'order-2', orderNumber: 2 }]);

    const result = await getOrderNotificationSignals(context, baseline.nextCursor);

    expect(result.items).toEqual([
      {
        eventId: 'audit-2',
        orderId: 'order-2',
        orderNumber: 2,
        isNew: true,
        createdAt: '2026-07-21T12:01:00.000Z',
      },
    ]);
    expect(result.hasMore).toBe(false);
    expect(result.processedEventIds).toEqual(['audit-2']);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 51,
      }),
    );
  });

  it('resolve mudanças de pagamento para o pedido sem expor metadata', async () => {
    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-payment',
        action: 'PAYMENT_CONFIRMED_MANUALLY',
        entity: 'Payment',
        entityId: 'payment-a',
        metadata: { orderId: 'order-a', previousStatus: 'PENDING', nextStatus: 'PAID' },
        createdAt: new Date('2026-07-21T12:02:00.000Z'),
      },
    ]);
    mocks.orderFindMany.mockResolvedValue([{ id: 'order-a', orderNumber: 12 }]);

    const result = await getOrderNotificationSignals(
      context,
      encodeOrderCursor({
        createdAt: new Date(0),
        id: '00000000-0000-0000-0000-000000000000',
      }),
    );

    expect(result.items).toEqual([
      {
        eventId: 'audit-payment',
        orderId: 'order-a',
        orderNumber: 12,
        isNew: false,
        createdAt: '2026-07-21T12:02:00.000Z',
      },
    ]);
    expect(result.items[0]).not.toHaveProperty('metadata');
  });

  it('recupera auditoria que ficou visível depois do avanço do cursor', async () => {
    const cursor = encodeOrderCursor({
      createdAt: new Date('2026-07-21T12:05:00.000Z'),
      id: 'audit-latest',
    });
    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-late',
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: 'order-late',
        metadata: null,
        createdAt: new Date('2026-07-21T12:04:00.000Z'),
      },
    ]);
    mocks.orderFindMany.mockResolvedValue([{ id: 'order-late', orderNumber: 13 }]);

    const result = await getOrderNotificationSignals(context, cursor, ['audit-latest']);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        eventId: 'audit-late',
        orderId: 'order-late',
        isNew: true,
      }),
    );
    expect(result.nextCursor).toBe(cursor);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              createdAt: { gte: new Date('2026-07-21T12:00:00.000Z') },
            }),
          ]),
          id: { notIn: ['audit-latest'] },
        }),
      }),
    );
  });

  it('mantém overlap quando o baseline estava vazio e recupera commit tardio', async () => {
    const cursor = encodeOrderCursor({
      createdAt: new Date('2026-07-21T12:05:00.000Z'),
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });
    mocks.auditFindMany.mockResolvedValue([
      {
        id: 'audit-late-empty-baseline',
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: 'order-late',
        metadata: null,
        createdAt: new Date('2026-07-21T12:04:30.000Z'),
      },
    ]);
    mocks.orderFindMany.mockResolvedValue([{ id: 'order-late', orderNumber: 14 }]);

    const result = await getOrderNotificationSignals(context, cursor, []);

    expect(result.items).toEqual([
      expect.objectContaining({
        eventId: 'audit-late-empty-baseline',
        orderId: 'order-late',
        orderNumber: 14,
      }),
    ]);
    expect(result.nextCursor).toBe(cursor);
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { createdAt: { gte: new Date('2026-07-21T12:00:00.000Z') } },
          ]),
        }),
      }),
    );
  });

  it('aplica cursor composto e não repete a contagem de ativos', async () => {
    const first = queueOrder('order-2', '2026-07-21T13:00:00.000Z');
    mocks.orderFindMany.mockResolvedValue([
      first,
      queueOrder('order-1', '2026-07-21T12:00:00.000Z'),
    ]);
    const firstPage = await getOrderQueue(context, { pageSize: 1, status: 'PENDING' });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );

    vi.clearAllMocks();
    mocks.orderFindMany.mockResolvedValue([]);
    await getOrderQueue(context, {
      pageSize: 1,
      status: 'PENDING',
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(mocks.orderCount).not.toHaveBeenCalled();
    expect(mocks.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      }),
    );
  });

  it('carrega detalhes no escopo e limita dados financeiros do atendente', async () => {
    mocks.paymentHistoryFindMany.mockResolvedValue([
      {
        id: 'payment-history-a',
        fromStatus: 'PENDING',
        toStatus: 'CUSTOMER_REPORTED_PAID',
        actorNameSnapshot: 'Cliente',
        source: 'CUSTOMER',
        reasonCode: 'PAYMENT_NOT_IDENTIFIED',
        note: 'Observação financeira restrita',
        createdAt: new Date('2026-07-21T12:09:00.000Z'),
      },
    ]);
    mocks.orderFindFirst.mockResolvedValue({
      id: 'order-a',
      orderNumber: 7,
      customerName: 'Cliente',
      customerPhone: '(85) 99999-9999',
      modality: 'PICKUP',
      deliveryAddress: null,
      deliveryZoneName: null,
      deliveryStreet: null,
      deliveryNumber: null,
      deliveryNeighborhood: null,
      deliveryCity: null,
      deliveryState: null,
      deliveryPostalCode: null,
      promisedFulfillmentMinAt: null,
      promisedFulfillmentMaxAt: null,
      subtotal: 2500,
      discount: 0,
      deliveryFee: 0,
      total: 2500,
      paymentMethod: 'CASH',
      changeFor: 5000,
      paymentStatus: 'PENDING',
      status: 'READY',
      notes: 'Sem cebola',
      version: 3,
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
      statusChangedAt: new Date('2026-07-21T12:10:00.000Z'),
      acceptedAt: new Date('2026-07-21T12:01:00.000Z'),
      preparingAt: new Date('2026-07-21T12:02:00.000Z'),
      readyAt: new Date('2026-07-21T12:10:00.000Z'),
      dispatchedAt: null,
      deliveredAt: null,
      cancellationReasonCode: null,
      cancellationNote: null,
      cancelledAt: null,
      items: [],
      payment: {
        id: 'payment-a',
        method: 'CASH',
        status: 'PENDING',
        amount: 2500,
        paidAt: null,
        reportedAt: null,
        failedAt: null,
        failureReasonCode: null,
        cancelledAt: null,
        refundedAt: null,
        refundReasonCode: null,
        refundAmount: null,
      },
      statusHistory: [historyEntry()],
    });

    const result = await getOrderDetails(context, 'order-a');

    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-a', tenantId: 'tenant-a', storeId: 'store-a' },
      }),
    );
    expect(result.customer.phone).toBe('(85) 99999-9999');
    expect(result.payment.amount).toBeNull();
    expect(result.payment.changeFor).toBeNull();
    expect(result.allowedActions.complete).toBe(true);
    expect(result.allowedActions.cancel).toBe(false);
    expect(result.allowedActions.undo).toBe(true);
    expect(result.allowedActions.confirmPayment).toBe(true);
    expect(result.allowedActions.markPaymentFailed).toBe(false);
    expect(result.allowedActions.refundPayment).toBe(false);
    expect(result.recentPaymentHistory).toEqual([
      expect.objectContaining({
        action: 'PENDING_CUSTOMER_REPORTED_PAID',
        actorName: 'Cliente',
        nextStatus: 'CUSTOMER_REPORTED_PAID',
        reasonCode: null,
        note: null,
      }),
    ]);
  });

  it('pagina histórico somente após confirmar o pedido no escopo', async () => {
    mocks.orderFindFirst.mockResolvedValue({ id: 'order-a' });
    mocks.historyFindMany.mockResolvedValue([
      historyEntry('history-2'),
      { ...historyEntry('history-1'), createdAt: new Date(Date.now() - 1000) },
    ]);

    const result = await getOrderHistory(context, 'order-a', { pageSize: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-a', tenantId: 'tenant-a', storeId: 'store-a' },
      }),
    );
  });

  it('calcula métricas financeiras no servidor com definições separadas', async () => {
    mocks.orderGroupBy
      .mockResolvedValueOnce([
        { status: 'PENDING', _count: { _all: 2 } },
        { status: 'DELIVERED', _count: { _all: 3 } },
        { status: 'CANCELLED', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { paymentStatus: 'PAID', _count: { _all: 3 }, _sum: { total: 9000 } },
        { paymentStatus: 'PENDING', _count: { _all: 2 }, _sum: { total: 4000 } },
      ]);
    mocks.orderAggregate.mockResolvedValue({ _count: { _all: 5 }, _sum: { total: 13000 } });
    mocks.queryRaw.mockResolvedValue([
      { averageAcceptanceMinutes: 4.5, averagePreparationMinutes: 22 },
    ]);

    const result = await getDailyOrderMetrics({ ...context, tenantRole: 'MANAGER' }, '2026-07-21');

    expect(result).toEqual({
      financialMetricsVisible: true,
      orderCount: 6,
      activeCount: 2,
      completedCount: 3,
      cancelledCount: 1,
      grossSales: 13000,
      paidRevenue: 9000,
      pendingRevenue: 4000,
      averageTicket: 2600,
      pendingPaymentCount: 2,
      averageAcceptanceMinutes: 4.5,
      averagePreparationMinutes: 22,
    });
  });

  it('não consulta nem retorna métricas financeiras sem VIEW_BASIC_REPORTS', async () => {
    mocks.orderGroupBy.mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 2 } }]);
    mocks.queryRaw.mockResolvedValue([
      { averageAcceptanceMinutes: null, averagePreparationMinutes: null },
    ]);

    const result = await getDailyOrderMetrics(context, '2026-07-21');

    expect(mocks.orderAggregate).not.toHaveBeenCalled();
    expect(mocks.orderGroupBy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      financialMetricsVisible: false,
      grossSales: null,
      paidRevenue: null,
      pendingRevenue: null,
      averageTicket: null,
      pendingPaymentCount: null,
    });
  });

  it('agrega contagens ativas sem limite de página', async () => {
    mocks.orderGroupBy.mockResolvedValue([
      { status: 'PENDING', _count: { _all: 120 } },
      { status: 'PREPARING', _count: { _all: 30 } },
      { status: 'READY', _count: { _all: 10 } },
      { status: 'OUT_FOR_DELIVERY', _count: { _all: 5 } },
    ]);

    await expect(getActiveOrderCounts(context)).resolves.toEqual({
      total: 165,
      pending: 120,
      preparing: 30,
      ready: 15,
    });
  });
});
