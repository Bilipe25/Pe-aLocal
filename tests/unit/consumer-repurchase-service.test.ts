import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireConsumerForStore: vi.fn(),
  rebuildOrderIntentFromHistory: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/services/consumer-auth.service', () => ({
  requireConsumerForStore: mocks.requireConsumerForStore,
}));
vi.mock('@/server/services/repeat-order.service', () => ({
  rebuildOrderIntentFromHistory: mocks.rebuildOrderIntentFromHistory,
}));

import { getConsumerRepurchaseShortcuts } from '@/server/services/consumer-repurchase.service';

function order(id: string, quantity = 2) {
  return {
    id,
    orderNumber: Number(id.replace(/\D/gu, '')),
    createdAt: new Date(`2026-08-${20 - Number(id.replace(/\D/gu, ''))}T12:00:00Z`),
    items: [
      {
        productId: 'product-1',
        productName: 'X-Bacon',
        quantity,
        offerGroupId: null,
        options: [{ optionId: 'option-1' }],
      },
    ],
  };
}

describe('consumer repurchase shortcuts', () => {
  const findMany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireConsumerForStore.mockResolvedValue({
      scope: {
        id: 'store-1',
        tenantId: 'tenant-1',
        entitlement: { consumerConvenienceV2Enabled: true },
      },
      consumer: { customer: { id: 'customer-1' } },
    });
    mocks.getDb.mockReturnValue({ order: { findMany } });
    mocks.rebuildOrderIntentFromHistory.mockResolvedValue({
      readyItems: [{ productId: 'product-1' }],
      issues: [],
    });
  });

  it('shows a deterministic usual order only after three eligible equal compositions', async () => {
    findMany.mockResolvedValue([order('order-1'), order('order-2'), order('order-3')]);

    const result = await getConsumerRepurchaseShortcuts({ storeSlug: 'loja' });

    expect(result.usual).toMatchObject({
      orderId: 'order-1',
      occurrences: 3,
      items: [{ productName: 'X-Bacon', quantity: 2 }],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          customerId: 'customer-1',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
        }),
        take: 50,
      }),
    );
  });

  it('does not combine orders when quantity changes and hides unsafe rebuilds', async () => {
    findMany.mockResolvedValue([order('order-1', 1), order('order-2', 2), order('order-3', 3)]);
    await expect(getConsumerRepurchaseShortcuts({ storeSlug: 'loja' })).resolves.toEqual({
      usual: null,
      frequent: [],
    });
    expect(mocks.rebuildOrderIntentFromHistory).not.toHaveBeenCalled();
  });
});
