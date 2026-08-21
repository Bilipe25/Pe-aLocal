import { describe, expect, it } from 'vitest';

import type { CheckoutInput } from '@/schemas/checkout';
import {
  assertMatchingOrderFingerprint,
  createOrderFingerprint,
  createPosOrderFingerprint,
} from '@/server/services/order-idempotency.service';
import type { PosOrderInput } from '@/schemas/pos';

const input: CheckoutInput = {
  identityMode: 'VISITOR',
  customerName: 'Cliente',
  customerPhone: '(85) 99999-9999',
  modality: 'PICKUP',
  saveCustomerData: true,
  addressLabel: 'HOME',
  setAddressAsDefault: false,
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

function firstProductItem(value: CheckoutInput = input) {
  const item = value.items[0];
  if (!item || item.kind === 'COMBO') throw new Error('Produto de teste ausente.');
  return item;
}

function withoutVisitorPii<T extends { customerName: string; customerPhone: string }>(value: T) {
  const result: Partial<T> = { ...value };
  delete result.customerName;
  delete result.customerPhone;
  return result as Omit<T, 'customerName' | 'customerPhone'>;
}

describe('order idempotency fingerprint', () => {
  it('ignora a chave, lineId e ordenação sem alterar a semântica do checkout', () => {
    const equivalent: CheckoutInput = {
      ...input,
      idempotencyKey: '65bdab05-46f3-40ed-9285-c733721d8709',
      items: [
        {
          ...firstProductItem(),
          lineId: '10000000-0000-4000-8000-000000000002',
          optionIds: [...firstProductItem().optionIds].reverse(),
        },
      ],
    };

    expect(createOrderFingerprint(equivalent)).toBe(createOrderFingerprint(input));
  });

  it('mantém a tentativa do PDV estável e detecta alteração no recebimento', () => {
    const posInput: PosOrderInput = {
      modality: 'PICKUP',
      customerName: '',
      customerPhone: '',
      items: [
        {
          kind: 'PRODUCT',
          lineId: '10000000-0000-4000-8000-000000000001',
          productId: '00000000-0000-0000-0002-000000000001',
          quantity: 1,
          notes: '',
          optionIds: [],
        },
      ],
      notes: '',
      paymentMethod: 'CASH',
      paidNow: false,
      saveCustomerData: false,
      expectedQuoteFingerprint: 'a'.repeat(64),
      idempotencyKey: '4da03571-bffd-45ef-8c44-20686c487838',
    };
    const resolved = { customerId: null, diningTableId: null, addressId: null };

    expect(
      createPosOrderFingerprint(
        { ...posInput, idempotencyKey: '65bdab05-46f3-40ed-9285-c733721d8709' },
        resolved,
      ),
    ).toBe(createPosOrderFingerprint(posInput, resolved));
    expect(createPosOrderFingerprint({ ...posInput, paidNow: true }, resolved)).not.toBe(
      createPosOrderFingerprint(posInput, resolved),
    );
  });

  it('permanece determinístico com customizações distintas do mesmo produto', () => {
    const customized: CheckoutInput = {
      ...input,
      items: [
        { ...firstProductItem(), notes: 'Sem cebola' },
        {
          ...firstProductItem(),
          lineId: '10000000-0000-4000-8000-000000000003',
          notes: 'Com bacon',
          optionIds: [firstProductItem().optionIds[1]],
        },
      ],
    };
    const reordered: CheckoutInput = {
      ...customized,
      items: [...customized.items]
        .reverse()
        .map((entry) =>
          entry.kind === 'COMBO' ? entry : { ...entry, optionIds: [...entry.optionIds].reverse() },
        ),
    };

    expect(createOrderFingerprint(reordered)).toBe(createOrderFingerprint(customized));
  });

  it.each([
    ['cliente', { customerName: 'Outra pessoa' }],
    ['cupom', { couponCode: 'BEMVINDO10' }],
    ['CEP', { deliveryPostalCode: '01001000' }],
    ['zona', { deliveryZoneId: '20000000-0000-4000-8000-000000000001' }],
    ['referência salva', { savedAddressReference: 'r'.repeat(43) }],
    ['consentimento', { saveCustomerData: false }],
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

  it('vincula o replay reconhecido à identidade resolvida no servidor', () => {
    const recognizedInput: CheckoutInput = {
      ...withoutVisitorPii(input),
      identityMode: 'RECOGNIZED',
    };
    const firstIdentity = {
      customerId: '10000000-0000-4000-8000-000000000001',
      customerName: 'Cliente Um',
      customerPhone: '(11) 99999-9999',
    };
    const secondIdentity = {
      ...firstIdentity,
      customerId: '10000000-0000-4000-8000-000000000002',
    };

    expect(createOrderFingerprint(recognizedInput, firstIdentity)).not.toBe(
      createOrderFingerprint(recognizedInput, secondIdentity),
    );
    expect(createOrderFingerprint(recognizedInput, firstIdentity)).not.toBe(
      createOrderFingerprint(input),
    );
  });
});
