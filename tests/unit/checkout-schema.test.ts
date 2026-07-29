import { describe, expect, it } from 'vitest';

import {
  cartQuoteSchema,
  checkoutQuoteSchema,
  checkoutSchema,
  MAX_CHECKOUT_ITEM_QUANTITY,
  MAX_CHECKOUT_LINES,
  MAX_CHECKOUT_OPTIONS_PER_LINE,
  MAX_CHECKOUT_TOTAL_UNITS,
} from '@/schemas/checkout';

const quoteFingerprint = 'a'.repeat(64);

function uuid(index: number) {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function item(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    lineId: uuid(index),
    productId: uuid(10_000 + index),
    quantity: 1,
    notes: '',
    optionIds: [],
    ...overrides,
  };
}

const validCheckout = {
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP' as const,
  paymentMethod: 'PIX' as const,
  expectedQuoteFingerprint: quoteFingerprint,
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [item()],
};

describe('checkout v2 — contrato de pagamento e entrega', () => {
  it('permite prévia do carrinho sem antecipar a região, mas exige uma seleção no checkout', () => {
    const deliveryPreview = { modality: 'DELIVERY' as const, items: [item()] };

    expect(cartQuoteSchema.safeParse(deliveryPreview).success).toBe(true);
    expect(checkoutQuoteSchema.safeParse(deliveryPreview).success).toBe(false);
  });

  it.each(['11999999999', '(11) 99999-9999', '11 99999-9999', '+55 11 99999-9999'])(
    'normaliza telefone celular %s no servidor',
    (customerPhone) => {
      const result = checkoutSchema.parse({ ...validCheckout, customerPhone });
      expect(result.customerPhone).toBe('(11) 99999-9999');
    },
  );

  it('aceita telefone fixo e rejeita letras, DDI inválido e tamanhos incorretos', () => {
    expect(
      checkoutSchema.parse({ ...validCheckout, customerPhone: '11 3333-4444' }).customerPhone,
    ).toBe('(11) 3333-4444');
    for (const customerPhone of [
      '1199999',
      '551199999999999',
      'abc11999999999',
      '+54 11 99999-9999',
    ]) {
      expect(checkoutSchema.safeParse({ ...validCheckout, customerPhone }).success).toBe(false);
    }
  });

  it('aceita troco positivo somente para dinheiro', () => {
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        paymentMethod: 'CASH',
        changeFor: 5000,
      }).success,
    ).toBe(true);
    expect(checkoutSchema.safeParse({ ...validCheckout, changeFor: 5000 }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        paymentMethod: 'CARD_ON_DELIVERY',
        changeFor: 5000,
      }).success,
    ).toBe(false);
  });

  it('aceita endereço manual sem CEP e valida o CEP opcional quando informado', () => {
    expect(checkoutSchema.safeParse(validCheckout).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...validCheckout, modality: 'DELIVERY' }).success).toBe(
      false,
    );

    const deliveryAddress = {
      street: 'Praça da Sé',
      number: '100',
      complement: '',
      reference: '',
    };
    const parsed = checkoutSchema.parse({
      ...validCheckout,
      modality: 'DELIVERY',
      deliveryZoneId: uuid(999),
      deliveryAddress,
    });
    expect(parsed.deliveryPostalCode).toBeUndefined();
    expect(parsed.deliveryAddress?.postalCode).toBeUndefined();

    const withPostalCode = checkoutSchema.parse({
      ...validCheckout,
      modality: 'DELIVERY',
      deliveryZoneId: uuid(999),
      deliveryPostalCode: '01001-000',
      deliveryAddress: { ...deliveryAddress, postalCode: '01001000' },
    });
    expect(withPostalCode.deliveryPostalCode).toBe('01001000');

    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        modality: 'DELIVERY',
        deliveryZoneId: uuid(999),
        deliveryPostalCode: '01001000',
        deliveryAddress: { ...deliveryAddress, postalCode: '01111000' },
      }).success,
    ).toBe(false);
  });

  it('aceita referência opaca sem serializar um endereço e rejeita referência junto do manual', () => {
    const savedAddressReference = 'a'.repeat(43);
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        modality: 'DELIVERY',
        savedAddressReference,
      }).success,
    ).toBe(true);
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        modality: 'DELIVERY',
        deliveryZoneId: uuid(999),
        savedAddressReference,
        deliveryAddress: {
          street: 'Rua Segura',
          number: '10',
          complement: '',
          reference: '',
        },
      }).success,
    ).toBe(false);
  });

  it('retirada rejeita dados residuais de entrega e preferência de endereço', () => {
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        deliveryAddress: {
          street: 'Rua que não deveria ser enviada',
          number: '10',
          complement: '',
          reference: '',
        },
      }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        saveCustomerData: true,
        setAddressAsDefault: true,
      }).success,
    ).toBe(false);
  });

  it('exige fingerprint SHA-256 e rejeita chaves extras do navegador', () => {
    expect(
      checkoutSchema.safeParse({ ...validCheckout, expectedQuoteFingerprint: 'invalido' }).success,
    ).toBe(false);
    expect(checkoutSchema.safeParse({ ...validCheckout, adminRole: 'OWNER' }).success).toBe(false);
  });
});

describe('checkout v2 — limites de abuso', () => {
  it(`limita o carrinho a ${MAX_CHECKOUT_LINES} linhas`, () => {
    const atLimit = Array.from({ length: MAX_CHECKOUT_LINES }, (_, index) => item(index + 1));
    expect(checkoutQuoteSchema.safeParse({ modality: 'PICKUP', items: atLimit }).success).toBe(
      true,
    );
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [...atLimit, item(MAX_CHECKOUT_LINES + 1)],
      }).success,
    ).toBe(false);
  });

  it(`limita quantidade por linha a ${MAX_CHECKOUT_ITEM_QUANTITY} e total a ${MAX_CHECKOUT_TOTAL_UNITS}`, () => {
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { quantity: MAX_CHECKOUT_ITEM_QUANTITY })],
      }).success,
    ).toBe(true);
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { quantity: MAX_CHECKOUT_ITEM_QUANTITY + 1 })],
      }).success,
    ).toBe(false);
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { quantity: 99 }), item(2, { quantity: 99 }), item(3, { quantity: 53 })],
      }).success,
    ).toBe(false);
  });

  it(`limita adicionais a ${MAX_CHECKOUT_OPTIONS_PER_LINE}, rejeita duplicados e limita observações`, () => {
    const optionIds = Array.from({ length: MAX_CHECKOUT_OPTIONS_PER_LINE }, (_, index) =>
      uuid(20_000 + index),
    );
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { optionIds, notes: 'x'.repeat(500) })],
      }).success,
    ).toBe(true);
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { optionIds: [...optionIds, uuid(30_000)] })],
      }).success,
    ).toBe(false);
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { optionIds: [optionIds[0], optionIds[0]] })],
      }).success,
    ).toBe(false);
    expect(
      checkoutQuoteSchema.safeParse({
        modality: 'PICKUP',
        items: [item(1, { notes: 'x'.repeat(501) })],
      }).success,
    ).toBe(false);
  });
});
