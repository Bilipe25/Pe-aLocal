import { beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeOrderCursor } from '@/lib/orders/cursor';
import {
  getDailyOrderMetrics,
  getActiveOrderCounts,
  getOrderDetails,
  getOrderHistory,
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
  queryRaw: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({
    order: {
      findMany: mocks.orderFindMany,
      findFirst: mocks.orderFindFirst,
      count: mocks.orderCount,
      groupBy: mocks.orderGroupBy,
      aggregate: mocks.orderAggregate,
    },
    orderStatusHistory: { findMany: mocks.historyFindMany },
    $queryRaw: mocks.queryRaw,
  }),
}));

const context: OrderQueryContext = {
  tenantId: 'tenant-a',
  storeId: 'store-a',
  timeZone: 'America/Fortaleza',
  userId: 'user-a',
  tenantRole: 'ATTENDANT',
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
    mocks.orderFindFirst.mockResolvedValue({
      id: 'order-a',
      orderNumber: 7,
      customerName: 'Cliente',
      customerPhone: '(85) 99999-9999',
      modality: 'PICKUP',
      deliveryAddress: null,
      deliveryZoneName: null,
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
      cancellationReasonCode: null,
      cancellationNote: null,
      cancelledAt: null,
      items: [],
      payment: { method: 'CASH', status: 'PENDING', amount: 2500, paidAt: null },
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

    const result = await getDailyOrderMetrics(
      { ...context, tenantRole: 'MANAGER' },
      '2026-07-21',
    );

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
    mocks.orderGroupBy.mockResolvedValueOnce([
      { status: 'PENDING', _count: { _all: 2 } },
    ]);
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
