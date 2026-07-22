import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDailyOrderMetricsAction,
  getActiveOrderCountsAction,
  getOrderDetailsAction,
  getOrderHistoryAction,
  getOrderQueueAction,
} from '@/features/orders/query-actions';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  getOrderQueue: vi.fn(),
  getOrderDetails: vi.fn(),
  getOrderHistory: vi.fn(),
  getDailyOrderMetrics: vi.fn(),
  getActiveOrderCounts: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/services/order-query.service', () => ({
  getOrderQueue: mocks.getOrderQueue,
  getOrderDetails: mocks.getOrderDetails,
  getOrderHistory: mocks.getOrderHistory,
  getDailyOrderMetrics: mocks.getDailyOrderMetrics,
  getActiveOrderCounts: mocks.getActiveOrderCounts,
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
    mocks.getOrderDetails.mockResolvedValue({ id: 'order-a' });
    mocks.getOrderHistory.mockResolvedValue({ items: [], nextCursor: null });
    mocks.getDailyOrderMetrics.mockResolvedValue({ orderCount: 0 });
    mocks.getActiveOrderCounts.mockResolvedValue({ total: 0 });
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
  });

  it('protege detalhes com VIEW_ORDER_DETAILS', async () => {
    await getOrderDetailsAction({ orderId: '4da03571-bffd-45ef-8c44-20686c487838' });
    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(
      Permission.VIEW_ORDER_DETAILS,
    );
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
