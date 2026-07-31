import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOrderBoardLaneAction,
  getOrderBoardSnapshotAction,
  getOrderBoardTemporalSummaryAction,
  getDailyOrderMetricsAction,
  getActiveOrderCountsAction,
  getOrderDetailsAction,
  getOrderHistoryAction,
  getOrderNotificationSignalsAction,
  getOrderQueueAction,
} from '@/features/orders/query-actions';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  getOrderQueue: vi.fn(),
  getOrderBoardSnapshot: vi.fn(),
  getOrderBoardTemporalSummary: vi.fn(),
  getOrderBoardLane: vi.fn(),
  getOrderDetails: vi.fn(),
  getOrderHistory: vi.fn(),
  getDailyOrderMetrics: vi.fn(),
  getActiveOrderCounts: vi.fn(),
  getOrderNotificationSignals: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/services/order-query.service', () => ({
  getOrderQueue: mocks.getOrderQueue,
  getOrderBoardSnapshot: mocks.getOrderBoardSnapshot,
  getOrderBoardTemporalSummary: mocks.getOrderBoardTemporalSummary,
  getOrderBoardLane: mocks.getOrderBoardLane,
  getOrderDetails: mocks.getOrderDetails,
  getOrderHistory: mocks.getOrderHistory,
  getDailyOrderMetrics: mocks.getDailyOrderMetrics,
  getActiveOrderCounts: mocks.getActiveOrderCounts,
  getOrderNotificationSignals: mocks.getOrderNotificationSignals,
}));

const context = {
  session: {
    tenantId: 'tenant-a',
    tenantRole: 'MANAGER',
    userId: 'user-a',
  },
  store: {
    id: 'store-a',
    timeZone: 'America/Fortaleza',
  },
};

describe('actions de consulta de pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue(context);
    mocks.getOrderQueue.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getOrderBoardSnapshot.mockResolvedValue({ summary: {}, lanes: {} });
    mocks.getOrderBoardTemporalSummary.mockResolvedValue({
      delayedCount: 0,
      asOf: '2026-07-31T12:00:00.000Z',
    });
    mocks.getOrderBoardLane.mockResolvedValue({
      key: 'NEW',
      items: [],
      nextCursor: null,
      total: 0,
    });
    mocks.getOrderDetails.mockResolvedValue({ id: 'order-a' });
    mocks.getOrderHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getDailyOrderMetrics.mockResolvedValue({ orderCount: 0 });
    mocks.getActiveOrderCounts.mockResolvedValue({ total: 0 });
    mocks.getOrderNotificationSignals.mockResolvedValue({
      items: [],
      processedEventIds: [],
      nextCursor: 'cursor',
      hasMore: false,
    });
  });

  it('protege fila e métricas com VIEW_ORDERS', async () => {
    await getOrderQueueAction({ date: '2026-07-21' });
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);
    expect(mocks.getOrderQueue).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      expect.objectContaining({ date: '2026-07-21', pageSize: 30 }),
    );

    await getDailyOrderMetricsAction({ localDate: '2026-07-21' });
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);

    await getActiveOrderCountsAction();
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);

    await getOrderNotificationSignalsAction({});
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);
  });

  it('protege snapshot e paginação do board com VIEW_ORDERS', async () => {
    await getOrderBoardSnapshotAction({ localDate: '2026-07-31' });
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);
    expect(mocks.getOrderBoardSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      expect.objectContaining({
        localDate: '2026-07-31',
        onlyActive: false,
        delayedOnly: false,
      }),
    );

    await getOrderBoardTemporalSummaryAction({ localDate: '2026-07-31' });
    expect(mocks.getOrderBoardTemporalSummary).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      expect.objectContaining({ localDate: '2026-07-31' }),
    );

    await getOrderBoardLaneAction({
      localDate: '2026-07-31',
      lane: 'READY_AND_DELIVERY',
    });
    expect(mocks.requireActiveStoreContext).toHaveBeenLastCalledWith(Permission.VIEW_ORDERS);
    expect(mocks.getOrderBoardLane).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      expect.objectContaining({ lane: 'READY_AND_DELIVERY', pageSize: 10 }),
    );
  });

  it('rejeita input inválido do board antes de autenticar', async () => {
    const result = await getOrderBoardSnapshotAction({ localDate: '31/07/2026' });
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.requireActiveStoreContext).not.toHaveBeenCalled();
    expect(mocks.getOrderBoardSnapshot).not.toHaveBeenCalled();
  });

  it('protege detalhes com VIEW_ORDER_DETAILS', async () => {
    await getOrderDetailsAction({ orderId: '4da03571-bffd-45ef-8c44-20686c487838' });
    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.VIEW_ORDER_DETAILS);
  });

  it('protege histórico com VIEW_ORDER_HISTORY', async () => {
    await getOrderHistoryAction({
      orderId: '4da03571-bffd-45ef-8c44-20686c487838',
    });
    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.VIEW_ORDER_HISTORY);
  });

  it('rejeita filtro inválido antes de autenticar ou consultar', async () => {
    const result = await getOrderQueueAction({ query: 'a', pageSize: 1000 });
    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.requireActiveStoreContext).not.toHaveBeenCalled();
    expect(mocks.getOrderQueue).not.toHaveBeenCalled();
  });
});
