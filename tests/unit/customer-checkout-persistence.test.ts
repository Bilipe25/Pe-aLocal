import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutInput } from '@/schemas/checkout';
import { persistCheckoutCustomerAfterOrder } from '@/server/services/customer-checkout-persistence.service';

const now = new Date('2026-07-29T12:00:00.000Z');
const input: CheckoutInput = {
  customerName: 'João Martins',
  customerPhone: '(11) 99999-9999',
  modality: 'DELIVERY',
  deliveryZoneId: '10000000-0000-4000-8000-000000000001',
  deliveryAddress: {
    street: 'Rua das Flores',
    number: '182',
    complement: 'Apto 4',
    reference: 'Portão azul',
  },
  saveCustomerData: true,
  addressLabel: 'HOME',
  setAddressAsDefault: false,
  paymentMethod: 'PIX',
  notes: '',
  expectedQuoteFingerprint: 'a'.repeat(64),
  idempotencyKey: '20000000-0000-4000-8000-000000000001',
  items: [
    {
      lineId: '30000000-0000-4000-8000-000000000001',
      productId: '40000000-0000-4000-8000-000000000001',
      quantity: 1,
      notes: '',
      optionIds: [],
    },
  ],
};

function createTx() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    customer: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    customerAddress: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    customerAddressStoreUse: { upsert: vi.fn() },
    order: { update: vi.fn() },
  };
}

const address = {
  street: 'Rua das Flores',
  number: '182',
  complement: 'Apto 4',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01001000',
  reference: 'Portão azul',
};

describe('persistência opcional do consumidor após o pedido', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opt-out preserva somente os snapshots e não consulta nem vincula Customer', async () => {
    const tx = createTx();

    const result = await persistCheckoutCustomerAfterOrder({
      tx: tx as never,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
      input: { ...input, saveCustomerData: false },
      address,
      deliveryZoneId: input.deliveryZoneId,
      now,
    });

    expect(result).toEqual({ customerId: null, addressId: null, nameConflict: false });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.customer.findUnique).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('telefone existente com nome diferente permanece visitante e não altera cadastro', async () => {
    const tx = createTx();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-a',
      name: 'Maria Souza',
      recognitionEnabled: true,
    });

    const result = await persistCheckoutCustomerAfterOrder({
      tx: tx as never,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
      input,
      address,
      deliveryZoneId: input.deliveryZoneId,
      now,
    });

    expect(result).toEqual({ customerId: null, addressId: null, nameConflict: true });
    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.customer.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('não reativa silenciosamente reconhecimento previamente desabilitado', async () => {
    const tx = createTx();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-a',
      name: 'JOAO MARTINS',
      recognitionEnabled: false,
    });
    tx.customer.update.mockResolvedValue({ id: 'customer-a' });
    tx.customerAddress.findUnique.mockResolvedValue(null);
    tx.customerAddress.count.mockResolvedValue(0);
    tx.customerAddress.updateMany.mockResolvedValue({ count: 0 });
    tx.customerAddress.create.mockResolvedValue({ id: 'address-a' });
    tx.customerAddressStoreUse.upsert.mockResolvedValue({ id: 'use-a' });
    tx.order.update.mockResolvedValue({ id: 'order-a' });

    await persistCheckoutCustomerAfterOrder({
      tx: tx as never,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
      input,
      address,
      deliveryZoneId: input.deliveryZoneId,
      now,
    });

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-a' },
      data: { lastOrderAt: now },
      select: { id: true },
    });
  });

  it('deduplica endereço, atualiza a referência recente e mapeia a zona da loja', async () => {
    const tx = createTx();
    tx.customer.findUnique.mockResolvedValue({
      id: 'customer-a',
      name: 'João Martins',
      recognitionEnabled: true,
    });
    tx.customer.update.mockResolvedValue({ id: 'customer-a' });
    tx.customerAddress.findUnique.mockResolvedValue({ id: 'address-a' });
    tx.customerAddress.count.mockResolvedValue(1);
    tx.customerAddress.update.mockResolvedValue({ id: 'address-a' });
    tx.customerAddressStoreUse.upsert.mockResolvedValue({ id: 'use-a' });
    tx.order.update.mockResolvedValue({ id: 'order-a' });

    const result = await persistCheckoutCustomerAfterOrder({
      tx: tx as never,
      tenantId: 'tenant-a',
      storeId: 'store-a',
      orderId: 'order-a',
      input,
      address,
      deliveryZoneId: input.deliveryZoneId,
      now,
    });

    expect(tx.customerAddress.update).toHaveBeenCalledWith({
      where: { id: 'address-a' },
      data: {
        lastUsedAt: now,
        reference: 'Portão azul',
        label: 'HOME',
        isDefault: undefined,
      },
      select: { id: true },
    });
    expect(tx.customerAddressStoreUse.upsert).toHaveBeenCalledWith({
      where: { customerAddressId_storeId: { customerAddressId: 'address-a', storeId: 'store-a' } },
      create: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        customerAddressId: 'address-a',
        deliveryZoneId: input.deliveryZoneId,
        lastUsedAt: now,
      },
      update: { deliveryZoneId: input.deliveryZoneId, lastUsedAt: now },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-a' },
      data: { customerId: 'customer-a' },
    });
    expect(result).toEqual({
      customerId: 'customer-a',
      addressId: 'address-a',
      nameConflict: false,
    });
  });
});
