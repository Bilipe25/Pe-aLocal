import { describe, expect, it } from 'vitest';

import { checkoutSchema } from '@/schemas/checkout';

const validCheckout = {
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP' as const,
  paymentMethod: 'PIX' as const,
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      optionIds: [],
    },
  ],
};

describe('checkout payment rules', () => {
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

  it('mantém endereço e zona obrigatórios somente para entrega', () => {
    expect(checkoutSchema.safeParse(validCheckout).success).toBe(true);
    expect(checkoutSchema.safeParse({ ...validCheckout, modality: 'DELIVERY' }).success).toBe(
      false,
    );
  });
});

describe('checkout com dados determinísticos do seed', () => {
  it('aceita produtos, adicionais e zonas persistidos pela loja de demonstração', () => {
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        modality: 'DELIVERY',
        deliveryZoneId: '00000000-0000-0000-0005-000000000001',
        deliveryAddress: 'Rua Demonstração, 100',
        items: [
          {
            productId: '00000000-0000-0000-0002-000000000001',
            quantity: 1,
            optionIds: ['00000000-0000-0000-0004-000000000001'],
          },
        ],
      }).success,
    ).toBe(true);
  });
});
