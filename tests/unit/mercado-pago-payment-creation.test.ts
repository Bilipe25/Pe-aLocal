import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  searchOrders: vi.fn(),
  decryptCredential: vi.fn(),
  getAccessToken: vi.fn(),
  markReauthRequired: vi.fn(),
  db: {
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
  getMercadoPagoAccessToken: mocks.getAccessToken,
  markMercadoPagoReauthRequired: mocks.markReauthRequired,
}));

import { MercadoPagoApiError } from '@/lib/mercado-pago/client';
import { ensureMercadoPagoPixCreated } from '@/server/services/mercado-pago-payment.service';

const localCreation = {
  id: 'mp-local-1',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  orderId: 'order-1',
  paymentId: 'payment-1',
  connectionId: 'connection-1',
  externalReference: 'pl_mp_opaque_reference',
  idempotencyKey: 'stable-idempotency-key',
  createdAt: new Date('2026-08-12T17:00:00.000Z'),
  credentialVersion: 1,
  payerEmailCiphertext: 'ciphertext',
  payerEmailIv: 'iv',
  providerOrderId: null,
  creationStatus: 'PENDING' as const,
  qrCode: null,
  ticketUrl: null,
  expiresAt: null,
  order: { total: 1234 },
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
  mocks.getAccessToken.mockResolvedValue('APP_USR-access');
  mocks.decryptCredential.mockResolvedValue('payer@example.test');
  mocks.db.mercadoPagoPayment.updateMany.mockResolvedValue({ count: 1 });
});

describe('criação idempotente do Pix Mercado Pago', () => {
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
  });
});
