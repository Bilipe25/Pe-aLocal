import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

import { createOrder } from '@/server/repositories/order.repository';
import { createOrderFingerprint } from '@/server/services/order-idempotency.service';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    store: { findUnique: vi.fn(), findFirst: vi.fn() },
    storeDiningTable: { findUnique: vi.fn() },
    diningTableSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    diningTableServiceRequest: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    orderOfferGroup: { createMany: vi.fn() },
    orderItem: { create: vi.fn() },
    orderPriceAdjustment: { createMany: vi.fn() },
    storeOffer: { findMany: vi.fn() },
    storeOfferUsage: { count: vi.fn(), createMany: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn() },
    couponUsage: { create: vi.fn() },
    couponReservation: { create: vi.fn() },
    customer: { findFirst: vi.fn() },
    mercadoPagoPayment: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown, options?: unknown) => {
      void options;
      return callback(tx);
    }),
    calculateCheckoutQuote: vi.fn(),
    toPublicCheckoutQuote: vi.fn((quote: unknown) => quote),
    writeOrderCreatedAudit: vi.fn(),
    appendOrderOutboxEvent: vi.fn(),
    persistCheckoutCustomerAfterOrder: vi.fn(),
    persistDeviceRecognitionAfterOrder: vi.fn(),
    resolveActiveRecognitionSession: vi.fn(),
    resolveRecognitionIdentity: vi.fn(),
    resolveRecognitionAddressReference: vi.fn(),
    consumeRecognitionSession: vi.fn(),
  };
});

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ $transaction: mocks.transaction }),
}));
vi.mock('@/server/services/checkout-quote.service', () => ({
  calculateCheckoutQuote: mocks.calculateCheckoutQuote,
  toPublicCheckoutQuote: mocks.toPublicCheckoutQuote,
}));
vi.mock('@/server/services/order-audit.service', () => ({
  writeOrderCreatedAudit: mocks.writeOrderCreatedAudit,
}));
vi.mock('@/server/services/order-outbox.service', () => ({
  appendOrderOutboxEvent: mocks.appendOrderOutboxEvent,
}));
vi.mock('@/server/services/customer-checkout-persistence.service', () => ({
  persistCheckoutCustomerAfterOrder: mocks.persistCheckoutCustomerAfterOrder,
}));
vi.mock('@/server/services/customer-device-recognition.service', () => ({
  persistDeviceRecognitionAfterOrder: mocks.persistDeviceRecognitionAfterOrder,
}));
vi.mock('@/server/services/customer-recognition.service', () => ({
  resolveActiveRecognitionSession: mocks.resolveActiveRecognitionSession,
  resolveRecognitionIdentity: mocks.resolveRecognitionIdentity,
  resolveRecognitionAddressReference: mocks.resolveRecognitionAddressReference,
  consumeRecognitionSession: mocks.consumeRecognitionSession,
}));

const expectedQuoteFingerprint = 'a'.repeat(64);
const now = new Date('2026-07-27T12:00:00.000Z');

const input = {
  identityMode: 'VISITOR' as const,
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP' as const,
  saveCustomerData: false,
  addressLabel: 'HOME' as const,
  setAddressAsDefault: false,
  paymentMethod: 'PIX' as const,
  notes: '',
  expectedQuoteFingerprint,
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      lineId: '10000000-0000-4000-8000-000000000001',
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      notes: '',
      optionIds: [],
    },
  ],
};
const idempotencyFingerprint = createOrderFingerprint(input);

const quote = {
  quoteFingerprint: expectedQuoteFingerprint,
  storeId: 'store-a',
  storeSlug: 'loja-a',
  tenantId: 'tenant-a',
  lines: [
    {
      lineId: input.items[0].lineId,
      productId: input.items[0].productId,
      productName: 'Produto',
      imageUrl: '/api/store-assets/asset-order?width=192',
      imageAssetId: 'asset-order',
      quantity: 1,
      notes: '',
      options: [],
      unitPrice: 2000,
      itemTotal: 2000,
    },
  ],
  subtotal: 2000,
  discount: 0,
  deliveryFee: 0,
  total: 2000,
  minOrderValue: 0,
  missingForMinimum: 0,
  deliveryZoneId: null,
  deliveryZoneName: null,
  promisedFulfillmentMinAt: '2026-07-27T12:30:00.000Z',
  promisedFulfillmentMaxAt: '2026-07-27T12:50:00.000Z',
  coupon: null,
  couponId: null,
  issues: [],
  canCheckout: true,
  estimatedMinMinutes: 30,
  estimatedMaxMinutes: 50,
};

const params = {
  input,
  storeSlug: 'loja-a',
  idempotencyFingerprint,
};

describe('OrderRepository checkout v2', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.store.findUnique.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      address: { city: 'São Paulo', state: 'SP' },
      settings: {
        acceptsPix: true,
        pixKeyType: 'EMAIL',
        pixKey: 'financeiro@loja.test',
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        paymentMode: 'MANUAL',
      },
      entitlement: { onlinePaymentsEnabled: false },
      paymentProviderConnections: [],
    });
    mocks.tx.store.findFirst.mockResolvedValue(null);
    mocks.tx.storeDiningTable.findUnique.mockResolvedValue(null);
    mocks.tx.diningTableSession.findFirst.mockResolvedValue(null);
    mocks.tx.diningTableSession.create.mockResolvedValue({
      id: 'dining-session-a',
      publicToken: 'S'.repeat(43),
    });
    mocks.tx.diningTableSession.update.mockResolvedValue({ id: 'dining-session-a' });
    mocks.tx.diningTableSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({ id: 'dining-audit-a' });
    mocks.tx.order.findUnique.mockResolvedValue(null);
    mocks.tx.order.create.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      createdAt: now,
      payment: { id: 'payment-a' },
    });
    mocks.tx.orderOfferGroup.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.orderItem.create.mockResolvedValue({ id: 'item-a' });
    mocks.tx.orderPriceAdjustment.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.storeOffer.findMany.mockResolvedValue([]);
    mocks.tx.storeOfferUsage.count.mockResolvedValue(0);
    mocks.tx.storeOfferUsage.createMany.mockResolvedValue({ count: 0 });
    mocks.tx.coupon.update.mockResolvedValue({ id: 'coupon-a' });
    mocks.tx.coupon.findUnique.mockResolvedValue({
      maxUsages: 100,
      usageCount: 0,
      _count: { reservations: 0 },
    });
    mocks.tx.couponUsage.create.mockResolvedValue({ id: 'usage-a' });
    mocks.tx.couponReservation.create.mockResolvedValue({ id: 'reservation-a' });
    mocks.calculateCheckoutQuote.mockResolvedValue(quote);
    mocks.writeOrderCreatedAudit.mockResolvedValue('audit-a');
    mocks.appendOrderOutboxEvent.mockResolvedValue({ id: 'outbox-a' });
    mocks.persistCheckoutCustomerAfterOrder.mockResolvedValue({
      customerId: null,
      addressId: null,
      nameConflict: false,
    });
    mocks.persistDeviceRecognitionAfterOrder.mockResolvedValue(null);
    mocks.resolveActiveRecognitionSession.mockResolvedValue(null);
    mocks.resolveRecognitionIdentity.mockResolvedValue(null);
    mocks.resolveRecognitionAddressReference.mockResolvedValue(null);
    mocks.consumeRecognitionSession.mockResolvedValue(true);
  });

  it('persiste AWAITING_PAYMENT e não publica ORDER_CREATED antes do Pix online', async () => {
    vi.stubEnv('MERCADO_PAGO_ENABLED', 'true');
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('MERCADO_PAGO_CLIENT_ID', 'client-id');
    vi.stubEnv('MERCADO_PAGO_CLIENT_SECRET', 'client-secret');
    vi.stubEnv(
      'MERCADO_PAGO_REDIRECT_URI',
      'https://app.test/api/integrations/mercado-pago/oauth/callback',
    );
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY', btoa('\0'.repeat(32)));
    vi.stubEnv('MERCADO_PAGO_TEST_APPLICATION_ID', 'test-application-id');
    vi.stubEnv('MERCADO_PAGO_TEST_ACCESS_TOKEN', 'APP_USR-test-access-token');
    mocks.tx.store.findUnique.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      address: { city: 'São Paulo', state: 'SP' },
      settings: {
        acceptsPix: false,
        pixKeyType: null,
        pixKey: null,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        paymentMode: 'ONLINE',
      },
      entitlement: { onlinePaymentsEnabled: true },
      paymentProviderConnections: [{ id: 'connection-a' }],
    });
    mocks.tx.order.create.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: null,
      createdAt: now,
      payment: { id: 'payment-a' },
    });
    mocks.tx.mercadoPagoPayment.create.mockResolvedValue({ id: 'mp-a' });
    mocks.calculateCheckoutQuote.mockResolvedValue({
      ...quote,
      subtotal: 5000,
      total: 5000,
      lines: [{ ...quote.lines[0], unitPrice: 5000, itemTotal: 5000 }],
    });

    const onlineInput = { ...input, payerEmail: 'test_user_br@testuser.com' };
    const result = await createOrder({ ...params, input: onlineInput });

    expect(result).toMatchObject({
      onlinePayment: true,
      paymentReportToken: null,
      outboxEventIds: [],
    });
    expect(mocks.tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AWAITING_PAYMENT',
          paymentReportToken: null,
          payment: { create: expect.objectContaining({ provider: 'MERCADO_PAGO' }) },
        }),
      }),
    );
    expect(mocks.tx.mercadoPagoPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: 'connection-a',
          creationStatus: 'PENDING',
        }),
      }),
    );
    const encryptedEmail = mocks.tx.mercadoPagoPayment.create.mock.calls[0][0].data;
    expect(encryptedEmail.payerEmailCiphertext).not.toContain('test_user_br@testuser.com');
    expect(mocks.appendOrderOutboxEvent).not.toHaveBeenCalled();
  });

  it('rejeita um total diferente de R$ 50,00 antes de criar pedido Pix no sandbox', async () => {
    vi.stubEnv('MERCADO_PAGO_ENABLED', 'true');
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('MERCADO_PAGO_TEST_APPLICATION_ID', 'test-application-id');
    vi.stubEnv('MERCADO_PAGO_TEST_ACCESS_TOKEN', 'APP_USR-test-access-token');
    mocks.tx.store.findUnique.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      address: { city: 'São Paulo', state: 'SP' },
      settings: {
        acceptsPix: false,
        pixKeyType: null,
        pixKey: null,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        paymentMode: 'ONLINE',
      },
      entitlement: { onlinePaymentsEnabled: true },
      paymentProviderConnections: [{ id: 'connection-a' }],
    });

    await expect(
      createOrder({
        ...params,
        input: { ...input, payerEmail: 'test_user_br@testuser.com' },
      }),
    ).rejects.toMatchObject({
      code: 'CART_INVALID',
      message: expect.stringContaining('total exato de R$ 50,00'),
      details: [{ path: 'paymentMethod', code: 'invalid_amount_for_sandbox' }],
    });
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
    expect(mocks.tx.mercadoPagoPayment.create).not.toHaveBeenCalled();
  });

  it.each(['CASH', 'CARD_ON_DELIVERY'] as const)(
    'mantém %s no fluxo manual quando apenas o Pix usa o modo online',
    async (paymentMethod) => {
      vi.stubEnv('MERCADO_PAGO_ENABLED', 'true');
      mocks.tx.store.findUnique.mockResolvedValue({
        id: 'store-a',
        tenantId: 'tenant-a',
        address: { city: 'São Paulo', state: 'SP' },
        settings: {
          acceptsPix: true,
          pixKeyType: 'EMAIL',
          pixKey: 'financeiro@loja.test',
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          paymentMode: 'ONLINE',
        },
        entitlement: { onlinePaymentsEnabled: true },
        paymentProviderConnections: [{ id: 'connection-a' }],
      });

      const manualInput = { ...input, paymentMethod };
      const result = await createOrder({
        storeSlug: params.storeSlug,
        input: manualInput,
      });

      expect(result).toMatchObject({ onlinePayment: false, mercadoPagoPaymentId: null });
      expect(mocks.tx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            payment: { create: expect.objectContaining({ provider: null }) },
          }),
        }),
      );
      expect(mocks.tx.mercadoPagoPayment.create).not.toHaveBeenCalled();
      expect(mocks.appendOrderOutboxEvent).toHaveBeenCalledOnce();
    },
  );

  it('deriva loja e Mesa 08 do token e persiste o pedido de salão sem dados de entrega', async () => {
    const tableToken = 'A'.repeat(43);
    const diningTable = {
      id: 'table-08',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      label: 'Mesa 08',
      isActive: true,
      version: 4,
    };
    const dineInInput = {
      customerName: 'Maria',
      paymentMethod: 'CASH' as const,
      notes: 'Sem cebola',
      expectedQuoteFingerprint,
      idempotencyKey: 'bd7bfc8f-e557-4305-9691-3446481e186e',
      items: input.items,
    };
    mocks.tx.storeDiningTable.findUnique.mockResolvedValue(diningTable);
    mocks.tx.store.findFirst.mockResolvedValue({
      id: 'store-a',
      tenantId: 'tenant-a',
      slug: 'loja-a',
      address: { city: 'São Paulo', state: 'SP' },
      settings: {
        acceptsPix: false,
        pixKeyType: null,
        pixKey: null,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        acceptsCardInPerson: true,
        paymentMode: 'MANUAL',
      },
      entitlement: { onlinePaymentsEnabled: false, dineInQrEnabled: true },
      paymentProviderConnections: [],
    });
    mocks.tx.order.create.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 184,
      paymentReportToken: null,
      createdAt: now,
      payment: { id: 'payment-a' },
    });

    const result = await createOrder({ input: dineInInput, tableToken });

    expect(result).toMatchObject({
      storeId: 'store-a',
      paymentReportToken: null,
      diningSessionPublicToken: 'S'.repeat(43),
    });
    expect(mocks.tx.storeDiningTable.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicToken: tableToken } }),
    );
    expect(mocks.tx.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'store-a', tenantId: 'tenant-a' } }),
    );
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledWith(
      'loja-a',
      { ...dineInInput, modality: 'DINE_IN' },
      expect.objectContaining({ client: mocks.tx, diningTable }),
    );
    expect(mocks.tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modality: 'DINE_IN',
          diningTableId: 'table-08',
          diningTableSessionId: 'dining-session-a',
          diningTableLabelSnapshot: 'Mesa 08',
          customerPhone: null,
          deliveryAddress: null,
          deliveryFee: 0,
          changeFor: null,
          paymentReportToken: null,
          status: 'PENDING',
          paymentStatus: 'PENDING',
        }),
      }),
    );
    expect(mocks.persistCheckoutCustomerAfterOrder).not.toHaveBeenCalled();
  });

  it('recalcula e grava pedido, auditoria e outbox na mesma transação serializável', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = await createOrder(params);

    expect(result).toEqual({
      id: 'order-a',
      storeId: 'store-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      created: true,
      outboxEventIds: ['outbox-a'],
      customerNameConflict: false,
      rememberDeviceExpiresAt: null,
      mercadoPagoPaymentId: null,
      onlinePayment: false,
      diningSessionPublicToken: null,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 15_000,
    });
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledWith('loja-a', input, {
      client: mocks.tx,
      now,
      savedAddress: null,
    });
    expect(mocks.writeOrderCreatedAudit).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        orderId: 'order-a',
      }),
    );
    expect(mocks.appendOrderOutboxEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        auditLogId: 'audit-a',
        eventType: 'ORDER_CREATED',
        aggregateVersion: 0,
      }),
    );

    const createData = mocks.tx.order.create.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      idempotencyFingerprint,
      quoteFingerprint: expectedQuoteFingerprint,
      promisedFulfillmentMinAt: new Date('2026-07-27T12:30:00.000Z'),
      promisedFulfillmentMaxAt: new Date('2026-07-27T12:50:00.000Z'),
      statusHistory: {
        create: expect.objectContaining({ versionFrom: null, versionTo: 0 }),
      },
    });
    expect(createData.publicTokenExpiresAt).toEqual(new Date('2026-08-26T12:00:00.000Z'));
    expect(createData.items.create[0]).toMatchObject({
      position: 0,
      imageUrl: '/api/store-assets/asset-order?width=192',
      imageAssetId: 'asset-order',
    });
    expect(createData).not.toHaveProperty('orderNumber');
    expect(mocks.tx.$executeRaw.mock.calls[0][1]).toBe(`store-a:${params.input.idempotencyKey}`);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.order.findUnique.mock.invocationCallOrder[0],
    );
  });

  it('persiste grupo, componentes reais e ledger de ajustes da cotação', async () => {
    mocks.calculateCheckoutQuote.mockResolvedValueOnce({
      ...quote,
      automaticDiscount: 500,
      couponDiscount: 0,
      discount: 500,
      total: 1500,
      offerGroups: [
        {
          lineId: 'combo-line',
          comboId: '70000000-0000-4000-8000-000000000001',
          comboVersion: 3,
          name: 'Combo da Casa',
          quantity: 1,
          regularBaseAmount: 2000,
          offerBaseAmount: 1500,
          discountAmount: 500,
          components: [{ lineId: quote.lines[0].lineId, comboItemId: 'combo-item-a', position: 0 }],
        },
      ],
      adjustments: [
        {
          type: 'COMBO',
          sourceId: '70000000-0000-4000-8000-000000000001',
          sourceVersion: 3,
          label: 'Combo: Combo da Casa',
          amount: 500,
          offerGroupLineId: 'combo-line',
        },
      ],
      lines: [
        {
          ...quote.lines[0],
          offerGroupLineId: 'combo-line',
          offerComponentPosition: 0,
        },
      ],
    });

    await createOrder(params);

    expect(mocks.tx.orderOfferGroup.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 'order-a',
          sourceOfferVersion: 3,
          nameSnapshot: 'Combo da Casa',
          discountAmount: 500,
        }),
      ],
    });
    expect(mocks.tx.orderItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-a',
        offerGroupId: expect.any(String),
        offerComponentPosition: 0,
      }),
    });
    expect(mocks.tx.orderPriceAdjustment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          adjustmentType: 'COMBO',
          labelSnapshot: 'Combo: Combo da Casa',
          amount: 500,
          orderOfferGroupId: expect.any(String),
        }),
      ],
    });
    expect(mocks.tx.order.create.mock.calls[0][0].data).not.toHaveProperty('items');
  });

  it('persiste posição e grupo dos adicionais sem consultar o catálogo novamente', async () => {
    mocks.calculateCheckoutQuote.mockResolvedValueOnce({
      ...quote,
      lines: [
        {
          ...quote.lines[0],
          options: [
            {
              id: '40000000-0000-4000-8000-000000000001',
              name: 'Bacon',
              price: 300,
              position: 0,
              groupId: '30000000-0000-4000-8000-000000000001',
              groupName: 'Adicionais',
              groupPosition: 10,
            },
          ],
        },
      ],
    });

    await createOrder(params);

    expect(mocks.tx.order.create.mock.calls[0][0].data.items.create[0]).toMatchObject({
      position: 0,
      options: {
        create: [
          {
            position: 0,
            optionId: '40000000-0000-4000-8000-000000000001',
            optionName: 'Bacon',
            optionPrice: 300,
            groupId: '30000000-0000-4000-8000-000000000001',
            groupName: 'Adicionais',
            groupPosition: 10,
          },
        ],
      },
    });
  });

  it('retorna pedido idempotente antes de recalcular cotação ou criar efeitos duplicados', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      idempotencyFingerprint,
    });

    const result = await createOrder(params);

    expect(result).toMatchObject({ created: false, outboxEventIds: [] });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
    expect(mocks.writeOrderCreatedAudit).not.toHaveBeenCalled();
    expect(mocks.appendOrderOutboxEvent).not.toHaveBeenCalled();
  });

  it('cria ou renova o vínculo do aparelho somente após persistir um Customer elegível', async () => {
    const expiresAt = new Date('2026-10-25T12:00:00.000Z');
    mocks.persistCheckoutCustomerAfterOrder.mockResolvedValueOnce({
      customerId: 'customer-a',
      addressId: null,
      nameConflict: false,
    });
    mocks.persistDeviceRecognitionAfterOrder.mockResolvedValueOnce({
      remembered: true,
      expiresAt,
    });

    const result = await createOrder({
      ...params,
      input: { ...input, saveCustomerData: true },
      deviceTokenHash: 'd'.repeat(64),
    });

    expect(mocks.persistDeviceRecognitionAfterOrder).toHaveBeenCalledWith({
      tx: mocks.tx,
      tokenHash: 'd'.repeat(64),
      tenantId: 'tenant-a',
      storeId: 'store-a',
      customerId: 'customer-a',
      now: expect.any(Date),
    });
    expect(result.rememberDeviceExpiresAt).toEqual(expiresAt);
  });

  it('rejeita reuso da chave idempotente com payload diferente', async () => {
    mocks.tx.order.findUnique.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      idempotencyFingerprint: 'fingerprint-diferente',
    });

    await expect(createOrder(params)).rejects.toMatchObject({ code: 'CART_INVALID' });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
  });

  it('retorna QUOTE_CHANGED sem criar pedido quando o estado autoritativo mudou', async () => {
    mocks.calculateCheckoutQuote.mockResolvedValue({
      ...quote,
      quoteFingerprint: 'c'.repeat(64),
      total: 2500,
    });

    await expect(createOrder(params)).rejects.toMatchObject({
      code: 'QUOTE_CHANGED',
      statusCode: 409,
    });
    expect(mocks.toPublicCheckoutQuote).toHaveBeenCalledOnce();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
    expect(mocks.writeOrderCreatedAudit).not.toHaveBeenCalled();
  });

  it('consome cupom e registra seu uso dentro da mesma transação', async () => {
    mocks.calculateCheckoutQuote.mockResolvedValue({
      ...quote,
      couponId: 'coupon-a',
      coupon: { code: 'BEMVINDO10', discount: 200 },
      automaticDiscount: 0,
      couponDiscount: 200,
      discount: 200,
      total: 1800,
      offerGroups: [],
      adjustments: [
        {
          type: 'COUPON',
          sourceId: 'coupon-a',
          sourceVersion: null,
          label: 'Cupom BEMVINDO10',
          amount: 200,
        },
      ],
    });

    await createOrder({ ...params, input: { ...input, couponCode: 'BEMVINDO10' } });

    expect(mocks.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.calculateCheckoutQuote.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.$queryRaw.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon-a' },
      data: { usageCount: { increment: 1 } },
    });
    expect(mocks.tx.couponUsage.create).toHaveBeenCalledWith({
      data: { couponId: 'coupon-a', orderId: 'order-a', discount: 200 },
    });
  });

  it('não retorna sucesso quando auditoria ou outbox falham', async () => {
    mocks.writeOrderCreatedAudit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(createOrder(params)).rejects.toThrow('audit unavailable');

    mocks.writeOrderCreatedAudit.mockResolvedValueOnce('audit-a');
    mocks.appendOrderOutboxEvent.mockRejectedValueOnce(new Error('outbox unavailable'));
    await expect(createOrder(params)).rejects.toThrow('outbox unavailable');
  });

  it('resolve referência store-bound, recalcula e grava snapshots completos sem confiar no navegador', async () => {
    const savedAddressReference = 'r'.repeat(43);
    const recognitionBrowserToken = 't'.repeat(43);
    const deliveryInput = {
      ...input,
      identityMode: 'RECOGNIZED' as const,
      modality: 'DELIVERY' as const,
      savedAddressReference,
      saveCustomerData: true,
      deliveryZoneId: 'zone-a',
    };
    const resolvedAddress = {
      id: 'address-a',
      updatedAt: new Date('2026-07-20T12:00:00.000Z'),
      addressFingerprint: 'f'.repeat(64),
      street: 'Rua das Flores',
      number: '182',
      complement: 'Apto 4',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
      reference: 'Portão azul',
    };
    mocks.resolveRecognitionIdentity.mockResolvedValue({
      sessionId: 'session-a',
      customerId: 'customer-a',
      confirmationMode: 'SAVED_ADDRESS',
      customerName: 'Cliente',
      customerPhone: '(85) 99999-9999',
      phoneNormalized: '5585999999999',
      consumedAt: null,
    });
    mocks.tx.customer.findFirst.mockResolvedValue({ id: 'customer-a', name: 'Cliente' });
    mocks.resolveRecognitionAddressReference.mockResolvedValue({
      referenceId: 'reference-a',
      sessionId: 'session-a',
      customerId: 'customer-a',
      address: resolvedAddress,
      mappedDeliveryZoneId: 'zone-a',
    });
    mocks.calculateCheckoutQuote.mockResolvedValue({
      ...quote,
      deliveryZoneId: 'zone-a',
      deliveryZoneName: 'Centro',
      deliveryFee: 600,
      total: 2600,
    });

    await createOrder({
      input: deliveryInput,
      storeSlug: 'loja-a',
      recognitionBrowserToken,
    });

    expect(mocks.resolveRecognitionAddressReference).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      opaqueReference: savedAddressReference,
      browserToken: recognitionBrowserToken,
      client: mocks.tx,
      now: expect.any(Date),
    });
    expect(mocks.calculateCheckoutQuote).toHaveBeenCalledWith('loja-a', deliveryInput, {
      client: mocks.tx,
      now: expect.any(Date),
      savedAddress: { ...resolvedAddress, mappedDeliveryZoneId: 'zone-a' },
    });
    expect(mocks.tx.order.create.mock.calls[0][0].data).toMatchObject({
      deliveryAddress:
        'Rua das Flores, 182, Apto 4, Centro, São Paulo - SP, CEP 01001-000, Referência: Portão azul',
      deliveryPostalCode: '01001000',
      deliveryStreet: 'Rua das Flores',
      deliveryNumber: '182',
      deliveryComplement: 'Apto 4',
      deliveryNeighborhood: 'Centro',
      deliveryCity: 'São Paulo',
      deliveryState: 'SP',
      deliveryReference: 'Portão azul',
    });
    expect(mocks.consumeRecognitionSession).toHaveBeenCalledWith(
      mocks.tx,
      'session-a',
      expect.any(Date),
    );
  });

  it('deriva região, cidade e UF no servidor para endereço manual sem CEP', async () => {
    const deliveryInput = {
      ...input,
      modality: 'DELIVERY' as const,
      deliveryZoneId: 'zone-a',
      deliveryAddress: {
        street: 'Rua Nova',
        number: '25',
        complement: '',
        reference: 'Próximo à praça',
      },
    };
    mocks.calculateCheckoutQuote.mockResolvedValue({
      ...quote,
      deliveryZoneId: 'zone-a',
      deliveryZoneName: 'Bela Vista',
      deliveryFee: 700,
      total: 2700,
    });

    await createOrder({
      input: deliveryInput,
      storeSlug: 'loja-a',
    });

    expect(mocks.tx.order.create.mock.calls[0][0].data).toMatchObject({
      deliveryAddress: 'Rua Nova, 25, Bela Vista, São Paulo - SP, Referência: Próximo à praça',
      deliveryPostalCode: null,
      deliveryStreet: 'Rua Nova',
      deliveryNumber: '25',
      deliveryNeighborhood: 'Bela Vista',
      deliveryCity: 'São Paulo',
      deliveryState: 'SP',
      deliveryReference: 'Próximo à praça',
    });
    expect(mocks.persistCheckoutCustomerAfterOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryZoneId: 'zone-a',
        address: expect.objectContaining({
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          zipCode: null,
        }),
      }),
    );
  });

  it('rejeita referência ausente ou pertencente a outra loja antes de criar o pedido', async () => {
    mocks.resolveRecognitionIdentity.mockResolvedValue({
      sessionId: 'session-a',
      customerId: 'customer-a',
      confirmationMode: 'SAVED_ADDRESS',
      customerName: 'Cliente',
      customerPhone: '(85) 99999-9999',
      phoneNormalized: '5585999999999',
      consumedAt: null,
    });
    mocks.tx.customer.findFirst.mockResolvedValue({ id: 'customer-a', name: 'Cliente' });
    mocks.resolveRecognitionAddressReference.mockResolvedValue(null);

    await expect(
      createOrder({
        input: {
          ...input,
          identityMode: 'RECOGNIZED',
          modality: 'DELIVERY',
          savedAddressReference: 'r'.repeat(43),
        },
        storeSlug: 'loja-a',
        recognitionBrowserToken: 't'.repeat(43),
      }),
    ).rejects.toMatchObject({ code: 'SAVED_ADDRESS_UNAVAILABLE', statusCode: 409 });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
  });

  it('consome sessão negativa ou não confirmada sem vinculá-la ao Customer', async () => {
    mocks.resolveRecognitionIdentity.mockResolvedValue(null);
    mocks.resolveActiveRecognitionSession.mockResolvedValue({ sessionId: 'session-negative' });

    await createOrder({
      ...params,
      recognitionBrowserToken: 't'.repeat(43),
    });

    expect(mocks.resolveActiveRecognitionSession).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      browserToken: 't'.repeat(43),
      client: mocks.tx,
      now: expect.any(Date),
    });
    expect(mocks.consumeRecognitionSession).toHaveBeenCalledWith(
      mocks.tx,
      'session-negative',
      expect.any(Date),
    );
    expect(mocks.persistCheckoutCustomerAfterOrder).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedCustomerId: null }),
    );
  });

  it('repete somente conflitos serializáveis P2034 e mantém o mesmo contrato', async () => {
    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('serialization conflict', {
        code: 'P2034',
        clientVersion: '7.8.0',
      }),
    );

    const result = await createOrder(params);

    expect(result).toMatchObject({ id: 'order-a', created: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tx.order.create).toHaveBeenCalledOnce();
  });
});
