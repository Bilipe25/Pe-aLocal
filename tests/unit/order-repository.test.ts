import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

import { createOrder } from '@/server/repositories/order.repository';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    store: { findUnique: vi.fn() },
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    coupon: { update: vi.fn() },
    couponUsage: { create: vi.fn() },
    customer: { findFirst: vi.fn() },
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
    resolveActiveRecognitionSession: vi.fn(),
    resolveConfirmedRecognition: vi.fn(),
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
vi.mock('@/server/services/customer-recognition.service', () => ({
  resolveActiveRecognitionSession: mocks.resolveActiveRecognitionSession,
  resolveConfirmedRecognition: mocks.resolveConfirmedRecognition,
  resolveRecognitionAddressReference: mocks.resolveRecognitionAddressReference,
  consumeRecognitionSession: mocks.consumeRecognitionSession,
}));

const expectedQuoteFingerprint = 'a'.repeat(64);
const idempotencyFingerprint = 'b'.repeat(64);
const now = new Date('2026-07-27T12:00:00.000Z');

const input = {
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
      imageUrl: null,
      imageAssetId: null,
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
      },
    });
    mocks.tx.order.findUnique.mockResolvedValue(null);
    mocks.tx.order.create.mockResolvedValue({
      id: 'order-a',
      publicToken: 'public-token',
      orderNumber: 1,
      paymentReportToken: 'payment-report-token',
      createdAt: now,
      payment: { id: 'payment-a' },
    });
    mocks.tx.coupon.update.mockResolvedValue({ id: 'coupon-a' });
    mocks.tx.couponUsage.create.mockResolvedValue({ id: 'usage-a' });
    mocks.calculateCheckoutQuote.mockResolvedValue(quote);
    mocks.writeOrderCreatedAudit.mockResolvedValue('audit-a');
    mocks.appendOrderOutboxEvent.mockResolvedValue({ id: 'outbox-a' });
    mocks.persistCheckoutCustomerAfterOrder.mockResolvedValue({
      customerId: null,
      addressId: null,
      nameConflict: false,
    });
    mocks.resolveActiveRecognitionSession.mockResolvedValue(null);
    mocks.resolveConfirmedRecognition.mockResolvedValue(null);
    mocks.resolveRecognitionAddressReference.mockResolvedValue(null);
    mocks.consumeRecognitionSession.mockResolvedValue(true);
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
    expect(createData).not.toHaveProperty('orderNumber');
    expect(mocks.tx.$executeRaw.mock.calls[0][1]).toBe(`store-a:${params.input.idempotencyKey}`);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.order.findUnique.mock.invocationCallOrder[0],
    );
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
      discount: 200,
      total: 1800,
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
    mocks.resolveConfirmedRecognition.mockResolvedValue({
      sessionId: 'session-a',
      customerId: 'customer-a',
      confirmationMode: 'SAVED_ADDRESS',
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
      idempotencyFingerprint,
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
      idempotencyFingerprint,
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
    mocks.resolveConfirmedRecognition.mockResolvedValue({
      sessionId: 'session-a',
      customerId: 'customer-a',
      confirmationMode: 'SAVED_ADDRESS',
    });
    mocks.tx.customer.findFirst.mockResolvedValue({ id: 'customer-a', name: 'Cliente' });
    mocks.resolveRecognitionAddressReference.mockResolvedValue(null);

    await expect(
      createOrder({
        input: {
          ...input,
          modality: 'DELIVERY',
          savedAddressReference: 'r'.repeat(43),
        },
        storeSlug: 'loja-a',
        idempotencyFingerprint,
        recognitionBrowserToken: 't'.repeat(43),
      }),
    ).rejects.toMatchObject({ code: 'SAVED_ADDRESS_UNAVAILABLE', statusCode: 409 });
    expect(mocks.calculateCheckoutQuote).not.toHaveBeenCalled();
    expect(mocks.tx.order.create).not.toHaveBeenCalled();
  });

  it('consome sessão negativa ou não confirmada sem vinculá-la ao Customer', async () => {
    mocks.resolveConfirmedRecognition.mockResolvedValue(null);
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
