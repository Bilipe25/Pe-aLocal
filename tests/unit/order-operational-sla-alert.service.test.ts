import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/services/store-staff-push-access', () => ({
  isStoreStaffPushAssociationAuthorized: vi.fn(() => true),
}));

import { reconcileOrderOperationalSlaAlerts } from '@/server/services/order-operational-sla-alert.service';

const candidate = {
  tenantId: 'tenant-1',
  storeId: 'store-1',
  orderId: 'order-1',
  actionableAt: new Date('2026-08-17T12:00:00.000Z'),
  stage: 'CRITICAL' as const,
};

function database(existing = false) {
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    orderOperationalSlaAlert: {
      findUnique: vi.fn().mockResolvedValue(existing ? { id: 'alert-1' } : null),
      create: vi.fn().mockResolvedValue({ id: 'alert-1' }),
    },
    storeStaffPushSubscription: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'staff-subscription-1',
          webPushSubscriptionId: 'web-subscription-1',
        },
      ]),
    },
    orderOperationalSlaDelivery: { createMany },
  };
  return {
    db: {
      $queryRaw: vi.fn().mockResolvedValue([candidate]),
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    },
    tx,
    createMany,
  };
}

describe('projeção dos alertas de SLA operacional', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria o estágio devido e faz fan-out uma única vez por dispositivo', async () => {
    const { db, tx, createMany } = database();

    const result = await reconcileOrderOperationalSlaAlerts(db as never);

    expect(result).toMatchObject({ candidates: 1, created: 1, deliveries: 1 });
    expect(tx.orderOperationalSlaAlert.create).toHaveBeenCalledWith({
      data: candidate,
      select: { id: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          slaAlertId: 'alert-1',
          webPushSubscriptionId: 'web-subscription-1',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('não duplica fan-out quando outro cron já persistiu o ciclo e estágio', async () => {
    const { db, tx, createMany } = database(true);

    const result = await reconcileOrderOperationalSlaAlerts(db as never);

    expect(result).toMatchObject({ candidates: 1, created: 0, deliveries: 0 });
    expect(tx.orderOperationalSlaAlert.create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
