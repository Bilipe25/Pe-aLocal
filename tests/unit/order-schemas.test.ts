import { describe, expect, it } from 'vitest';

import {
  cancelOrderInputSchema,
  markPaymentFailedInputSchema,
  orderVersionInputSchema,
  refundPaymentInputSchema,
  reportPixPaymentInputSchema,
} from '@/features/orders/schemas';

const validBase = {
  orderId: '4da03571-bffd-45ef-8c44-20686c487838',
  expectedVersion: 3,
};

describe('schemas de mutação de pedidos', () => {
  it('exige UUID e versão inteira não negativa', () => {
    expect(orderVersionInputSchema.safeParse(validBase).success).toBe(true);
    expect(orderVersionInputSchema.safeParse({ ...validBase, orderId: 'order-1' }).success).toBe(
      false,
    );
    expect(orderVersionInputSchema.safeParse({ ...validBase, expectedVersion: -1 }).success).toBe(
      false,
    );
    expect(orderVersionInputSchema.safeParse({ ...validBase, expectedVersion: 1.5 }).success).toBe(
      false,
    );
  });

  it('exige observação para o motivo OTHER', () => {
    expect(cancelOrderInputSchema.safeParse({ ...validBase, reasonCode: 'OTHER' }).success).toBe(
      false,
    );
    expect(
      cancelOrderInputSchema.safeParse({
        ...validBase,
        reasonCode: 'OTHER',
        note: 'Motivo operacional não listado',
      }).success,
    ).toBe(true);
  });

  it('rejeita HTML e observações acima do limite', () => {
    expect(
      cancelOrderInputSchema.safeParse({
        ...validBase,
        reasonCode: 'CUSTOMER_REQUEST',
        note: '<strong>cancelar</strong>',
      }).success,
    ).toBe(false);
    expect(
      cancelOrderInputSchema.safeParse({
        ...validBase,
        reasonCode: 'CUSTOMER_REQUEST',
        note: 'a'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it.each([markPaymentFailedInputSchema, refundPaymentInputSchema])(
    'protege observações financeiras e exige detalhe para OTHER',
    (schema) => {
      expect(schema.safeParse({ ...validBase, reasonCode: 'OTHER' }).success).toBe(false);
      expect(
        schema.safeParse({ ...validBase, reasonCode: 'OTHER', note: 'Análise manual' }).success,
      ).toBe(true);
      expect(
        schema.safeParse({ ...validBase, reasonCode: 'OTHER', note: '<b>inválido</b>' }).success,
      ).toBe(false);
    },
  );

  it('aceita somente token público UUID para informar PIX', () => {
    expect(
      reportPixPaymentInputSchema.safeParse({
        reportToken: '4da03571-bffd-45ef-8c44-20686c487838',
      }).success,
    ).toBe(true);
    expect(reportPixPaymentInputSchema.safeParse({ reportToken: 'order-a' }).success).toBe(false);
  });
});
