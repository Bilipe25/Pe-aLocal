import { describe, expect, it } from 'vitest';

import type { CheckoutInput } from '@/schemas/checkout';
import {
  assertMatchingOrderFingerprint,
  createOrderFingerprint,
} from '@/server/services/order-idempotency.service';

const input: CheckoutInput = {
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP',
  paymentMethod: 'PIX',
  notes: '',
  expectedQuoteFingerprint: 'a'.repeat(64),
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      lineId: '10000000-0000-4000-8000-000000000001',
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      notes: '',
      optionIds: ['3d78178d-af83-4a72-8215-dcb24d3df903', 'fdd28ba4-e805-48a7-89db-f374ee985109'],
    },
  ],
};

describe('order idempotency fingerprint', () => {
  it('ignora a chave, lineId e ordenação sem alterar a semântica do checkout', () => {
    const equivalent: CheckoutInput = {
      ...input,
      idempotencyKey: '65bdab05-46f3-40ed-9285-c733721d8709',
      items: [
        {
          ...input.items[0],
          lineId: '10000000-0000-4000-8000-000000000002',
          optionIds: [...input.items[0].optionIds].reverse(),
        },
      ],
    };

    expect(createOrderFingerprint(equivalent)).toBe(createOrderFingerprint(input));
  });

  it('permanece determinístico com customizações distintas do mesmo produto', () => {
    const customized: CheckoutInput = {
      ...input,
      items: [
        { ...input.items[0], notes: 'Sem cebola' },
        {
          ...input.items[0],
          lineId: '10000000-0000-4000-8000-000000000003',
          notes: 'Com bacon',
          optionIds: [input.items[0].optionIds[1]],
        },
      ],
    };
    const reordered: CheckoutInput = {
      ...customized,
      items: [...customized.items]
        .reverse()
        .map((entry) => ({ ...entry, optionIds: [...entry.optionIds].reverse() })),
    };

    expect(createOrderFingerprint(reordered)).toBe(createOrderFingerprint(customized));
  });

  it.each([
    ['cliente', { customerName: 'Outra pessoa' }],
    ['cupom', { couponCode: 'BEMVINDO10' }],
    ['CEP', { deliveryPostalCode: '01001000' }],
    ['cotação', { expectedQuoteFingerprint: 'b'.repeat(64) }],
  ])('muda quando %s altera o conteúdo confirmado', (_label, change) => {
    expect(createOrderFingerprint({ ...input, ...change })).not.toBe(createOrderFingerprint(input));
  });

  it('rejeita reuso com fingerprint diferente, mas aceita linhas legadas', () => {
    expect(() => assertMatchingOrderFingerprint(null, 'new')).not.toThrow();
    expect(() => assertMatchingOrderFingerprint('same', 'same')).not.toThrow();
    expect(() => assertMatchingOrderFingerprint('old', 'new')).toThrowError(
      'Esta tentativa de pedido já foi usada com outros dados.',
    );
  });
});
