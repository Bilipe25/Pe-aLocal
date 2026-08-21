import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  searchOrders: vi.fn(),
  decryptCredential: vi.fn(),
  getOrdersCredential: vi.fn(),
  markReauthRequired: vi.fn(),
  db: {
    order: {
      findFirst: vi.fn(),
    },
    mercadoPagoPayment: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/mercado-pago/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercado-pago/client')>();
  return {
    ...original,
    createMercadoPagoPixOrder: mocks.createOrder,
    getMercadoPagoOrder: mocks.getOrder,
    searchMercadoPagoOrders: mocks.searchOrders,
  };
});

vi.mock('@/lib/mercado-pago/config', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/mercado-pago/config')>();
  return {
    ...original,
    getMercadoPagoConfig: () => ({ encryptionKey: 'test-key', oauthEnvironment: 'sandbox' }),
  };
});

vi.mock('@/lib/mercado-pago/crypto', () => ({
  credentialAad: vi.fn(() => 'aad'),
  decryptCredential: mocks.decryptCredential,
}));

vi.mock('@/server/database/client', () => ({ getDb: () => mocks.db }));

vi.mock('@/server/services/mercado-pago-connection.service', () => ({
  markMercadoPagoReauthRequired: mocks.markReauthRequired,
}));

vi.mock('@/server/services/mercado-pago-orders-credential.service', () => ({
  getMercadoPagoOrdersCredential: mocks.getOrdersCredential,
}));

import { MercadoPagoApiError } from '@/lib/mercado-pago/client';
import {
  ensureMercadoPagoPixCreated,
  reconcileMercadoPagoOrder,
} from '@/server/services/mercado-pago-payment.service';

const localCreation = {
  id: 'mp-local-1',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  orderId: 'order-1',
  paymentId: 'payment-1',
  connectionId: 'connection-1',
  externalReference: 'pl_mp_opaque_reference',
  idempotencyKey: 'stable-idempotency-key',
  lastErrorCode: null,
  createdAt: new Date('2026-08-12T17:00:00.000Z'),
  credentialVersion: 1,
  payerEmailCiphertext: 'ciphertext',
  payerEmailIv: 'iv',
  providerOrderId: null,
  creationStatus: 'PENDING' as const,
  qrCode: null,
  ticketUrl: null,
  expiresAt: null,
  order: { total: 1234, status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' },
  payment: { status: 'PENDING', provider: 'MERCADO_PAGO' },
  connection: { providerUserId: '321' },
};

const canonicalOrder = {
  id: 'ORD01JTEST',
  user_id: '321',
  external_reference: localCreation.externalReference,
  total_amount: '12.34',
  status: 'action_required',
  status_detail: 'waiting_payment',
  transactions: {
    payments: [
      {
        id: 'PAY01JTEST',
        amount: '12.34',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        payment_method: { id: 'pix', type: 'bank_transfer', qr_code: '000201...' },
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrdersCredential.mockResolvedValue({
    accessToken: 'APP_USR-access',
    expectedProviderUserId: '321',
    source: 'APPLICATION_TEST',
  });
  mocks.decryptCredential.mockResolvedValue('payer@example.test');
  mocks.db.mercadoPagoPayment.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.order.findFirst.mockResolvedValue({ id: localCreation.orderId });
});

describe('criação idempotente do Pix Mercado Pago', () => {
  it('não cria cobrança quando o pedido já saiu do estado aguardando pagamento', async () => {
    mocks.db.mercadoPagoPayment.findUnique.mockResolvedValue({
      ...localCreation,
      order: { ...localCreation.order, status: 'CANCELLED', paymentStatus: 'CANCELLED' },
      payment: { ...localCreation.payment, status: 'CANCELLED' },
    });

    await expect(ensureMercadoPagoPixCreated(localCreation.id)).resolves.toBeNull();

    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.getOrdersCredential).not.toHaveBeenCalled();
  });

  it('revalida o estado imediatamente antes do POST ao provedor', async () => {
    mocks.db.mercadoPagoPayment.findUnique.mockResolvedValue(localCreation);
    mocks.db.order.findFirst.mockResolvedValue(null);

    await expect(ensureMercadoPagoPixCreated(localCreation.id)).resolves.toBeNull();

    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('em 409 pesquisa a external_reference e não repete o POST', async () => {
    mocks.db.mercadoPagoPayment.findUnique.mockResolvedValue(localCreation);
    mocks.createOrder.mockRejectedValue(
      new MercadoPagoApiError('conflito', 409, 'idempotency_key_already_used'),
    );
    mocks.searchOrders.mockResolvedValue({ data: [] });

    await expect(ensureMercadoPagoPixCreated(localCreation.id)).resolves.toBeNull();

    expect(mocks.createOrder).toHaveBeenCalledOnce();
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'sandbox' }),
    );
    expect(mocks.searchOrders).toHaveBeenCalledOnce();
    expect(mocks.db.mercadoPagoPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: localCreation.id }),
        data: expect.objectContaining({ creationStatus: 'RETRYABLE_ERROR' }),
      }),
    );
  });

  it('consulta a referência e troca a chave antes de repetir idempotency_validation_failed', async () => {
    mocks.db.mercadoPagoPayment.findUnique.mockResolvedValue(localCreation);
    mocks.createOrder
      .mockRejectedValueOnce(
        new MercadoPagoApiError('chave inválida', 400, 'idempotency_validation_failed'),
      )
      .mockRejectedValueOnce(new TypeError('network unavailable'));
    mocks.searchOrders.mockResolvedValue({ data: [] });

    await expect(ensureMercadoPagoPixCreated(localCreation.id)).resolves.toBeNull();

    expect(mocks.searchOrders).toHaveBeenCalledTimes(2);
    expect(mocks.searchOrders.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createOrder.mock.invocationCallOrder[1],
    );
    expect(mocks.createOrder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ idempotencyKey: 'stable-idempotency-key' }),
    );
    expect(mocks.createOrder).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^pl_[0-9a-f-]{36}$/u) }),
    );
    expect(mocks.db.mercadoPagoPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idempotencyKey: 'stable-idempotency-key' }),
        data: expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^pl_[0-9a-f-]{36}$/u),
        }),
      }),
    );
  });

  it('retoma um erro ambíguo pela external_reference antes de qualquer novo POST', async () => {
    const retryableLocal = { ...localCreation, creationStatus: 'RETRYABLE_ERROR' as const };
    const reconcileLocal = {
      ...retryableLocal,
      connection: { providerUserId: '321' },
      order: {
        id: localCreation.orderId,
        tenantId: localCreation.tenantId,
        storeId: localCreation.storeId,
        orderNumber: 42,
        total: 1234,
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        version: 1,
      },
      payment: { id: 'payment-1', status: 'PENDING', amount: 1234, provider: 'MERCADO_PAGO' },
    };
    const currentOrder = {
      ...reconcileLocal.order,
      payment: reconcileLocal.payment,
    };
    mocks.db.mercadoPagoPayment.findUnique
      .mockResolvedValueOnce(retryableLocal)
      .mockResolvedValueOnce(reconcileLocal);
    mocks.searchOrders.mockResolvedValue({ data: [canonicalOrder] });
    const tx = {
      order: { findFirst: vi.fn().mockResolvedValue(currentOrder) },
      mercadoPagoPayment: { update: vi.fn().mockResolvedValue(retryableLocal) },
      paymentProviderAlert: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    mocks.db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    await expect(ensureMercadoPagoPixCreated(localCreation.id)).resolves.toMatchObject({
      orderId: localCreation.orderId,
      paymentStatus: 'PENDING',
      becameActionable: false,
    });

    expect(mocks.searchOrders).toHaveBeenCalledOnce();
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(tx.paymentProviderAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'OPEN',
          code: { startsWith: 'ORDER_CREATE_' },
        }),
      }),
    );
  });

  it('marca reconciliação como SYSTEM e reserva ORDER_CREATED ao pedido acionável', async () => {
    const local = {
      ...localCreation,
      order: {
        id: localCreation.orderId,
        tenantId: localCreation.tenantId,
        storeId: localCreation.storeId,
        orderNumber: 47,
        total: 1234,
        status: 'AWAITING_PAYMENT',
        paymentStatus: 'PENDING',
        version: 0,
      },
      payment: { id: 'payment-1', status: 'PENDING', amount: 1234, provider: 'MERCADO_PAGO' },
    };
    const currentOrder = {
      ...local.order,
      payment: local.payment,
      couponReservation: null,
      store: {
        settings: { estimatedTimeMinMinutes: 20, estimatedTimeMaxMinutes: 40 },
      },
    };
    mocks.db.mercadoPagoPayment.findUnique.mockResolvedValue(local);
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue(currentOrder),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      mercadoPagoPayment: { update: vi.fn().mockResolvedValue(local) },
      paymentProviderAlert: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      paymentStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'payment-history-1' }) },
      orderStatusHistory: { create: vi.fn().mockResolvedValue({ id: 'order-history-1' }) },
      payment: { update: vi.fn().mockResolvedValue(local.payment) },
      auditLog: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'provider-audit-1' })
          .mockResolvedValueOnce({ id: 'order-audit-1' }),
      },
      orderOutboxEvent: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'payment-event-1' })
          .mockResolvedValueOnce({ id: 'order-event-1' }),
      },
    };
    mocks.db.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    await expect(
      reconcileMercadoPagoOrder(
        {
          ...canonicalOrder,
          currency: 'BRL',
          status: 'processed',
          status_detail: 'accredited',
          total_paid_amount: '12.34',
          transactions: {
            payments: [
              {
                ...canonicalOrder.transactions.payments[0],
                status: 'processed',
                status_detail: 'accredited',
                paid_amount: '12.34',
              },
            ],
          },
        },
        '321',
        'RECONCILIATION',
      ),
    ).resolves.toMatchObject({
      paymentStatus: 'PAID',
      becameActionable: true,
      eventIds: ['payment-event-1', 'order-event-1'],
    });

    expect(tx.paymentStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'SYSTEM' }) }),
    );
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'SYSTEM' }) }),
    );
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ORDER_CREATED',
          metadata: expect.objectContaining({
            source: 'RECONCILIATION',
            lifecycle: 'BECAME_ACTIONABLE_AFTER_PAYMENT',
          }),
        }),
      }),
    );
    expect(tx.orderOutboxEvent.create).toHaveBeenCalledTimes(2);
  });
});
