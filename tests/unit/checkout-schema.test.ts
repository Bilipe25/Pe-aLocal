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
