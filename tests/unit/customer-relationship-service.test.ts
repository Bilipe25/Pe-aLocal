import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  processClaimedDeliveredRelationshipOrders,
  processCustomerRelationshipForOrder,
} from '@/server/services/customer-relationship.service';

const completedAt = new Date('2026-09-02T12:00:00.000Z');

function order() {
  return {
    id: 'order-a',
    total: 4_200,
    deliveredAt: completedAt,
    statusChangedAt: completedAt,
    customer: {
      id: 'customer-a',
      consumerIdentityId: 'identity-a',
      consumerIdentityLinkProof: 'VERIFIED_SESSION',
      consumerIdentity: {
        id: 'identity-a',
        emailVerifiedAt: completedAt,
        phoneVerifiedAt: null,
      },
    },
  };
}

function transaction() {
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue(order()),
      findMany: vi.fn().mockResolvedValue([]),
    },
    storeEntitlement: { findFirst: vi.fn().mockResolvedValue({ id: 'entitlement-a' }) },
    $executeRaw: vi.fn().mockResolvedValue(0),
    customerRelationshipProcessedOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue({ id: 'processed-a' }),
    },
    customerRelationshipSnapshot: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'snapshot-a',
          recoveredAt: null,
          ...data,
        }),
      ),
      update: vi
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ id: 'snapshot-a', ...data })),
    },
    customerReturnCampaignRecipient: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customerReturnCampaignOrder: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('customer relationship order projection', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('materializa o primeiro pedido concluído como NEW', async () => {
    const tx = transaction();
    const result = await processCustomerRelationshipForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });

    expect(result).toMatchObject({ updated: true, segment: 'NEW' });
    expect(tx.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          storeId: 'store-a',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
        }),
      }),
    );
    expect(tx.customerRelationshipSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        completedOrderCount: 1,
        segment: 'NEW',
      }),
    });
    expect(tx.customerRelationshipProcessedOrder.create).toHaveBeenCalledOnce();
  });

  it('torna retry do mesmo Order um no-op', async () => {
    const tx = transaction();
    tx.customerRelationshipProcessedOrder.findFirst.mockResolvedValueOnce({ id: 'processed-a' });

    await expect(
      processCustomerRelationshipForOrder(tx as never, {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
      }),
    ).resolves.toEqual({ updated: false, reason: 'already_processed' });
    expect(tx.customerRelationshipSnapshot.create).not.toHaveBeenCalled();
    expect(tx.customerRelationshipProcessedOrder.create).not.toHaveBeenCalled();
  });

  it('não conta pedido cancelado, incompleto ou não pago', async () => {
    const tx = transaction();
    tx.order.findFirst.mockResolvedValueOnce(null);

    await expect(
      processCustomerRelationshipForOrder(tx as never, {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
      }),
    ).resolves.toEqual({ updated: false, reason: 'identity_not_verified' });
    expect(tx.customerRelationshipSnapshot.create).not.toHaveBeenCalled();
  });

  it('marca RECOVERED quando quem estava inativo conclui um novo pedido', async () => {
    const tx = transaction();
    tx.customerRelationshipSnapshot.findFirst.mockResolvedValueOnce({
      id: 'snapshot-a',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      consumerIdentityId: 'identity-a',
      customerId: 'customer-a',
      firstCompletedOrderAt: new Date('2026-05-01T12:00:00.000Z'),
      lastCompletedOrderAt: new Date('2026-08-03T12:00:00.000Z'),
      completedOrderCount: 4,
      totalCompletedOrderValue: 16_000,
      averageOrderValue: 4_000,
      averageDaysBetweenOrders: 10,
      recentOrderFrequency: 0,
      segment: 'INACTIVE',
      segmentUpdatedAt: new Date('2026-08-03T12:00:00.000Z'),
      recoveredAt: null,
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-03T12:00:00.000Z'),
    });

    const result = await processCustomerRelationshipForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });

    expect(result).toMatchObject({ updated: true, segment: 'RECOVERED' });
    expect(tx.customerRelationshipSnapshot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recoveredAt: completedAt, segment: 'RECOVERED' }),
      }),
    );
  });

  it('atribui conversão somente ao pedido concluído que usou a reward', async () => {
    const tx = transaction();
    tx.customerReturnCampaignRecipient.findMany.mockResolvedValueOnce([
      {
        id: 'recipient-a',
        campaignId: 'campaign-a',
        status: 'REWARDED',
        reward: { orderId: 'order-a', status: 'REDEEMED' },
      },
    ]);

    const result = await processCustomerRelationshipForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });

    expect(result).toMatchObject({ attributedCampaigns: 1 });
    expect(tx.customerReturnCampaignOrder.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ orderId: 'order-a', usedReward: true })],
      skipDuplicates: true,
    });
    expect(tx.customerReturnCampaignRecipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONVERTED' }) }),
    );
  });

  it('safe claim seleciona apenas DELIVERED + PAID ainda não projetados e mantém a Store', async () => {
    const tx = transaction();
    tx.order.findMany.mockResolvedValueOnce([{ id: 'order-a' }]);

    await processClaimedDeliveredRelationshipOrders(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
    });

    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-a',
          storeId: 'store-a',
          customerId: 'customer-a',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          customerRelationshipProcessing: null,
        },
      }),
    );
    expect(tx.customerRelationshipSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
    });
  });
});
