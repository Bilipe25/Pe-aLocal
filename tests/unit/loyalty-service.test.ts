import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  processClaimedDeliveredOrders,
  processLoyaltyForOrder,
  restoreLoyaltyRewardForCancelledOrder,
} from '@/server/services/loyalty.service';

function transaction() {
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'order-a',
        customer: {
          consumerIdentity: {
            id: 'identity-a',
            emailVerifiedAt: new Date(),
            phoneVerifiedAt: null,
          },
        },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    loyaltyContribution: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'contribution-a' }),
    },
    storeEntitlement: { findFirst: vi.fn().mockResolvedValue({ id: 'entitlement-a' }) },
    loyaltyProgram: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'program-a',
        version: 1,
        requiredOrders: 5,
        rewardValue: 1_000,
        minimumOrderValue: 3_000,
      }),
    },
    loyaltyCycle: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cycle-a',
        progress: 4,
        requiredOrders: 5,
        rewardValue: 1_000,
        minimumOrderValue: 3_000,
      }),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'cycle-a' }),
    },
    loyaltyReward: {
      create: vi.fn().mockResolvedValue({ id: 'reward-a' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('progressão da Fidelidade V1', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('não credita um pedido sem identidade verificada', async () => {
    const tx = transaction();
    tx.order.findFirst.mockResolvedValueOnce(null);
    const result = await processLoyaltyForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(result).toEqual({ credited: false, reason: 'identity_not_verified' });
    expect(tx.loyaltyContribution.create).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'])(
    'consulta somente DELIVERED e não credita um pedido %s',
    async () => {
      const tx = transaction();
      tx.order.findFirst.mockResolvedValueOnce(null);
      await processLoyaltyForOrder(tx as never, {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
      });
      expect(tx.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-a',
            storeId: 'store-a',
            status: 'DELIVERED',
          }),
        }),
      );
      expect(tx.loyaltyContribution.create).not.toHaveBeenCalled();
    },
  );

  it('não credita quando a capability está desligada', async () => {
    const tx = transaction();
    tx.storeEntitlement.findFirst.mockResolvedValueOnce(null);
    const result = await processLoyaltyForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(result).toEqual({ credited: false, reason: 'disabled' });
    expect(tx.loyaltyContribution.create).not.toHaveBeenCalled();
  });

  it('incrementa um ciclo sem antecipar o benefício', async () => {
    const tx = transaction();
    tx.loyaltyCycle.findFirst.mockResolvedValueOnce({
      id: 'cycle-a',
      progress: 2,
      requiredOrders: 5,
      rewardValue: 1_000,
      minimumOrderValue: 3_000,
    });
    const result = await processLoyaltyForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(tx.loyaltyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle-a' },
      data: { progress: 3 },
    });
    expect(tx.loyaltyReward.create).not.toHaveBeenCalled();
    expect(result).toEqual({ credited: true, rewardCreated: false, progress: 3 });
  });

  it('trata repetição do mesmo pedido como idempotente', async () => {
    const tx = transaction();
    tx.loyaltyContribution.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const result = await processLoyaltyForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(result).toEqual({ credited: false, reason: 'already_credited' });
    expect(tx.loyaltyCycle.update).not.toHaveBeenCalled();
    expect(tx.loyaltyReward.create).not.toHaveBeenCalled();
  });

  it('conclui 5/5 e cria exatamente um benefício com o snapshot do ciclo', async () => {
    const tx = transaction();
    const result = await processLoyaltyForOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(tx.loyaltyContribution.create).toHaveBeenCalledOnce();
    expect(tx.loyaltyCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle-a' },
      data: expect.objectContaining({ progress: 5, status: 'COMPLETED' }),
    });
    expect(tx.loyaltyReward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cycleId: 'cycle-a',
        value: 1_000,
        minimumOrderValue: 3_000,
      }),
    });
    expect(result).toMatchObject({ credited: true, rewardCreated: true, rewardId: 'reward-a' });
  });

  it('restaura uma recompensa consumida quando o pedido é cancelado', async () => {
    const tx = transaction();
    await restoreLoyaltyRewardForCancelledOrder(tx as never, {
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
    });
    expect(tx.loyaltyReward.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        orderId: 'order-a',
        status: { in: ['RESERVED', 'REDEEMED'] },
      }),
      data: expect.objectContaining({ status: 'AVAILABLE', orderId: null }),
    });
  });

  it('processa safe claim somente para pedidos entregues ainda sem contribuição', async () => {
    const tx = transaction();
    tx.order.findMany.mockResolvedValueOnce([{ id: 'order-a' }]);
    await processClaimedDeliveredOrders(tx as never, {
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
          loyaltyContribution: null,
        },
      }),
    );
    expect(tx.loyaltyContribution.create).toHaveBeenCalledOnce();
  });

  it('torna a restauração repetida um no-op seguro', async () => {
    const tx = transaction();
    tx.loyaltyReward.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      restoreLoyaltyRewardForCancelledOrder(tx as never, {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
      }),
    ).resolves.toBe(0);
  });
});
