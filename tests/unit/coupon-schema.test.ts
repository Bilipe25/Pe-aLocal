import { describe, expect, it } from 'vitest';

import { couponAdminInputSchema } from '@/schemas/coupon';

describe('couponAdminInputSchema', () => {
  it('normaliza código, moedas e datas de um cupom percentual', () => {
    const parsed = couponAdminInputSchema.parse({
      code: ' bemvindo-10 ',
      type: 'PERCENTAGE',
      value: '10',
      minOrderValue: '25.90',
      maxDiscount: '12.50',
      maxUsages: '100',
      startsAt: '2026-08-01T10:00:00-03:00',
      expiresAt: '2026-08-31T23:59:00-03:00',
      isActive: 'true',
    });

    expect(parsed).toMatchObject({
      code: 'BEMVINDO-10',
      type: 'PERCENTAGE',
      value: 10,
      minOrderValue: 2_590,
      maxDiscount: 1_250,
      maxUsages: 100,
      isActive: true,
    });
    expect(parsed.startsAt).toEqual(new Date('2026-08-01T13:00:00.000Z'));
  });

  it('converte desconto fixo para centavos e elimina limite percentual indevido', () => {
    const parsed = couponAdminInputSchema.parse({
      code: 'MENOS5',
      type: 'FIXED',
      value: '5.25',
      minOrderValue: '0',
      maxDiscount: '',
      maxUsages: '',
      startsAt: '',
      expiresAt: '',
      isActive: 'false',
    });

    expect(parsed).toEqual({
      code: 'MENOS5',
      type: 'FIXED',
      value: 525,
      minOrderValue: null,
      maxDiscount: null,
      maxUsages: null,
      startsAt: null,
      expiresAt: null,
      isActive: false,
    });
  });

  it('rejeita chaves extras, códigos inseguros e percentual fora do limite', () => {
    const result = couponAdminInputSchema.safeParse({
      code: '<script>',
      type: 'PERCENTAGE',
      value: 101,
      minOrderValue: '',
      maxDiscount: '',
      maxUsages: '',
      startsAt: '',
      expiresAt: '',
      isActive: true,
      tenantId: 'tenant-forged',
    });

    expect(result.success).toBe(false);
  });

  it('exige que o fim da validade seja posterior ao início', () => {
    const result = couponAdminInputSchema.safeParse({
      code: 'VALIDO10',
      type: 'PERCENTAGE',
      value: 10,
      minOrderValue: '',
      maxDiscount: '',
      maxUsages: '',
      startsAt: '2026-08-02T10:00:00-03:00',
      expiresAt: '2026-08-01T10:00:00-03:00',
      isActive: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ['expiresAt'] })]),
      );
    }
  });
});
