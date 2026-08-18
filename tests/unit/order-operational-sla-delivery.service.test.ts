import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  revoke: vi.fn(),
  resolveIdentity: vi.fn(),
}));

vi.mock('@/server/services/web-push-sender', () => ({
  sendWebPushNotification: mocks.send,
  webPushFailure: vi.fn(),
}));
vi.mock('@/server/services/web-push-revocation.service', () => ({
  revokeWebPushSubscription: mocks.revoke,
}));
vi.mock('@/server/services/web-push-store-identity.service', () => ({
  resolveWebPushStoreIdentity: mocks.resolveIdentity,
}));
vi.mock('@/server/services/store-staff-push-access', () => ({
  isStoreStaffPushAssociationAuthorized: vi.fn(() => true),
  countAuthorizedPendingStoreOrders: vi.fn().mockResolvedValue(1),
  findAuthorizedStoreStaffPushAssociations: vi.fn().mockResolvedValue([{ storeId: 'store-1' }]),
}));

import { processPendingOrderOperationalSlaDeliveries } from '@/server/services/order-operational-sla-delivery.service';

const config = {
  publicKey: 'A'.repeat(87),
  privateKey: 'B'.repeat(43),
  subject: 'mailto:push@pedidolocal.test',
};
const actionableAt = new Date('2026-08-17T12:00:00.000Z');

function database(
  status: 'PENDING' | 'CONFIRMED' = 'PENDING',
  stage: 'WARNING' | 'CRITICAL' = 'WARNING',
) {
  const deliveryUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const alertUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const db = {
    orderOperationalSlaDelivery: {
      findMany: vi.fn().mockResolvedValue([{ id: 'delivery-1' }]),
      updateManyAndReturn: vi.fn().mockResolvedValue([
        {
          id: 'delivery-1',
          tenantId: 'tenant-1',
          storeId: 'store-1',
          orderId: 'order-1',
          slaAlertId: 'alert-1',
          storeStaffPushSubscriptionId: 'staff-subscription-1',
          webPushSubscriptionId: 'web-subscription-1',
          attempts: 1,
        },
      ]),
      updateMany: deliveryUpdate,
    },
    orderOperationalSlaAlert: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'alert-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        orderId: 'order-1',
        actionableAt,
        stage,
        resolvedAt: null,
      }),
      updateMany: alertUpdate,
    },
    storeStaffPushSubscription: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'staff-subscription-1',
        userId: 'user-1',
        disabledAt: null,
        subscription: {
          endpoint: 'https://push.test/device',
          p256dh: 'p256dh',
          auth: 'auth',
          origin: 'https://pedidolocal.test',
        },
      }),
    },
    order: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        storeId: 'store-1',
        orderNumber: 184,
        status,
        statusChangedAt: actionableAt,
        version: 2,
        store: {
          entitlement: {
            operationalSlaEnabled: true,
            operationalSlaEnabledAt: new Date('2026-08-17T11:59:00.000Z'),
          },
        },
      }),
    },
  };
  return { db, deliveryUpdate, alertUpdate };
}

describe('delivery do SLA operacional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T12:03:00.000Z'));
    mocks.send.mockResolvedValue({ statusCode: 201 });
    mocks.resolveIdentity.mockResolvedValue({ name: 'Loja', iconAssetId: null });
  });

  afterEach(() => vi.useRealTimers());

  it('revalida o ciclo e envia uma vez mantendo o badge de pedidos PENDING', async () => {
    const { db, deliveryUpdate } = database();

    const result = await processPendingOrderOperationalSlaDeliveries(db as never, config);

    expect(result).toEqual({ candidates: 1, outcomes: { sent: 1 } });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[1].payload.pedidolocal).toMatchObject({
      type: 'new-order',
      reminderStage: 'WARNING',
      pendingActionableCount: 1,
    });
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('marca stale sem enviar quando o pedido sai de PENDING', async () => {
    const { db, deliveryUpdate, alertUpdate } = database('CONFIRMED');

    const result = await processPendingOrderOperationalSlaDeliveries(db as never, config);

    expect(result).toEqual({ candidates: 1, outcomes: { skipped: 1 } });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(deliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: 'operational_sla_stale',
        }),
      }),
    );
    expect(alertUpdate).toHaveBeenCalled();
  });
});
