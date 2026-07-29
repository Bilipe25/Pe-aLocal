import { describe, expect, it } from 'vitest';

import {
  customerRecognitionInputSchema,
  customerRecognitionPatchSchema,
} from '@/schemas/customer-recognition';

describe('customerRecognitionInputSchema', () => {
  it('normaliza telefone brasileiro e espaços do nome', () => {
    expect(
      customerRecognitionInputSchema.parse({
        customerPhone: '(11) 99999-1234',
        customerName: '  João   Martins ',
      }),
    ).toEqual({ customerPhone: '5511999991234', customerName: 'João Martins' });
  });

  it.each([
    { customerPhone: '123', customerName: 'João' },
    { customerPhone: '(11) 99999-1234', customerName: 'J' },
    { customerPhone: '(11) 99999-1234', customerName: 'João', customerId: 'vazamento' },
  ])('rejeita entrada inválida ou campos extras', (input) => {
    expect(customerRecognitionInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('customerRecognitionPatchSchema', () => {
  it('aceita somente as duas ações públicas previstas', () => {
    const reference = 'a'.repeat(43);
    expect(
      customerRecognitionPatchSchema.safeParse({
        action: 'CONFIRM_ADDRESS',
        opaqueReference: reference,
      }).success,
    ).toBe(true);
    expect(customerRecognitionPatchSchema.safeParse({ action: 'USE_NEW_ADDRESS' }).success).toBe(
      true,
    );
    expect(customerRecognitionPatchSchema.safeParse({ action: 'READ_HISTORY' }).success).toBe(
      false,
    );
  });
});
