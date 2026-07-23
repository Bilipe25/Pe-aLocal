import { describe, expect, it } from 'vitest';

import { collectOrderSignals } from './order-notifications';

describe('collectOrderSignals', () => {
  it('deduplica novos pedidos antes de solicitar invalidações', () => {
    const notified = new Set(['order-1']);

    const result = collectOrderSignals([
      { orderId: 'order-1', orderNumber: 1, isNew: true },
      { orderId: 'order-2', orderNumber: 2, isNew: true },
      { orderId: 'order-2', orderNumber: 2, isNew: true },
    ], notified);

    expect(result.changedOrderIds).toEqual(['order-2']);
    expect(result.unseenNewOrders).toEqual([{ orderId: 'order-2', orderNumber: 2 }]);
  });

  it('agrupa mudanças do mesmo pedido em uma única invalidação', () => {
    const result = collectOrderSignals([
      { orderId: 'order-1', orderNumber: 1, isNew: false },
      { orderId: 'order-1', orderNumber: 1, isNew: false },
      { orderId: 'order-2', orderNumber: 2, isNew: false },
    ], new Set());

    expect(result.changedOrderIds).toEqual(['order-1', 'order-2']);
    expect(result.unseenNewOrders).toEqual([]);
  });
});
