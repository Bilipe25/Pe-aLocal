import { describe, expect, it } from 'vitest';

import { posOrderSchema, posQuoteSchema } from '@/schemas/pos';

const item = {
  lineId: '20000000-0000-4000-8000-000000000001',
  productId: '00000000-0000-0000-0002-000000000001',
  quantity: 1,
  notes: '',
  optionIds: [],
};

describe('contrato do PDV', () => {
  it('aceita retirada sem cliente e sem dados artificiais', () => {
    const result = posOrderSchema.safeParse({
      modality: 'PICKUP',
      items: [item],
      customerName: '',
      customerPhone: '',
      notes: '',
      paymentMethod: 'CARD_IN_PERSON',
      paidNow: false,
      saveCustomerData: false,
      expectedQuoteFingerprint: 'a'.repeat(64),
      idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
    });
    expect(result.success).toBe(true);
  });

  it('exige cliente e endereço reais para entrega', () => {
    const result = posQuoteSchema.safeParse({
      modality: 'DELIVERY',
      items: [item],
      customerName: '',
      customerPhone: '',
      notes: '',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['customerName', 'deliveryAddress']),
    );
  });

  it('impede cartão na entrega fora de Delivery e cartão presencial em Delivery', () => {
    const common = {
      items: [item],
      customerName: '',
      customerPhone: '',
      notes: '',
      paidNow: false,
      saveCustomerData: false,
      expectedQuoteFingerprint: 'a'.repeat(64),
      idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
    };
    expect(
      posOrderSchema.safeParse({ ...common, modality: 'PICKUP', paymentMethod: 'CARD_ON_DELIVERY' })
        .success,
    ).toBe(false);
    expect(
      posOrderSchema.safeParse({
        ...common,
        modality: 'DELIVERY',
        customerName: 'Gabriel',
        customerPhone: '(11) 99999-9999',
        deliveryAddress: {
          deliveryZoneId: '00000000-0000-0000-0003-000000000001',
          street: 'Rua das Flores',
          number: '125',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
        },
        paymentMethod: 'CARD_IN_PERSON',
      }).success,
    ).toBe(false);
  });

  it('permite pago agora no Delivery somente para Pix manual', () => {
    const delivery = {
      modality: 'DELIVERY' as const,
      items: [item],
      customerName: 'Gabriel',
      customerPhone: '(11) 99999-9999',
      deliveryAddress: {
        deliveryZoneId: '00000000-0000-0000-0003-000000000001',
        street: 'Rua das Flores',
        number: '125',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
      },
      notes: '',
      paidNow: true,
      saveCustomerData: false,
      expectedQuoteFingerprint: 'a'.repeat(64),
      idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
    };

    expect(posOrderSchema.safeParse({ ...delivery, paymentMethod: 'CASH' }).success).toBe(false);
    expect(posOrderSchema.safeParse({ ...delivery, paymentMethod: 'PIX' }).success).toBe(true);
  });
});
