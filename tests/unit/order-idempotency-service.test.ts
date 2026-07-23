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
  idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
  items: [
    {
      productId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      quantity: 1,
      notes: '',
      optionIds: [
        '3d78178d-af83-4a72-8215-dcb24d3df903',
        'fdd28ba4-e805-48a7-89db-f374ee985109',
      ],
    },
  ],
};

describe('order idempotency fingerprint', () => {
  it('ignores the idempotency key and ordering without changing checkout semantics', () => {
    const equivalent: CheckoutInput = {
      ...input,
      idempotencyKey: '65bdab05-46f3-40ed-9285-c733721d8709',
      items: [{ ...input.items[0], optionIds: [...input.items[0].optionIds].reverse() }],
    };

    expect(createOrderFingerprint(equivalent)).toBe(createOrderFingerprint(input));
  });

  it('changes when order content changes', () => {
    expect(createOrderFingerprint({ ...input, customerName: 'Outra pessoa' }))
      .not.toBe(createOrderFingerprint(input));
  });

  it('rejects reuse with a different fingerprint but accepts legacy rows', () => {
    expect(() => assertMatchingOrderFingerprint(null, 'new')).not.toThrow();
    expect(() => assertMatchingOrderFingerprint('same', 'same')).not.toThrow();
    expect(() => assertMatchingOrderFingerprint('old', 'new')).toThrowError(
      'Esta tentativa de pedido já foi usada com outros dados.',
    );
  });
});
