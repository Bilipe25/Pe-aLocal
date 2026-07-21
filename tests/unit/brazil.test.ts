import { describe, expect, it } from 'vitest';

import {
  formatPhone,
  formatZipCode,
  maskPixKey,
  normalizePhone,
  normalizePixKey,
  normalizeSlug,
  normalizeState,
  normalizeZipCode,
  validateBrazilianPhone,
  validateBrazilianState,
  validateCnpj,
  validateCpf,
  validatePixKey,
} from '@/lib/brazil';

describe('normalizacao brasileira', () => {
  it('normaliza e formata telefone, CEP e UF', () => {
    expect(normalizePhone('(85) 99999-9999')).toBe('5585999999999');
    expect(formatPhone('5585999999999')).toBe('(85) 99999-9999');
    expect(validateBrazilianPhone('+55 (85) 99999-9999')).toBe(true);

    expect(normalizeZipCode('60.000-000')).toBe('60000000');
    expect(formatZipCode('60000000')).toBe('60000-000');

    expect(normalizeState(' ce ')).toBe('CE');
    expect(validateBrazilianState('CE')).toBe(true);
    expect(validateBrazilianState('XX')).toBe(false);
  });

  it('valida CPF e CNPJ com digitos verificadores reais', () => {
    expect(validateCpf('935.411.347-80')).toBe(true);
    expect(validateCpf('111.111.111-11')).toBe(false);

    expect(validateCnpj('45.723.174/0001-10')).toBe(true);
    expect(validateCnpj('00.000.000/0000-00')).toBe(false);
  });

  it('normaliza, valida e mascara chaves Pix por tipo', () => {
    expect(normalizePixKey('PHONE', '(85) 99999-9999')).toBe('+5585999999999');
    expect(validatePixKey('PHONE', '(85) 99999-9999')).toBe(true);
    expect(validatePixKey('EMAIL', 'Financeiro@Loja.COM.BR')).toBe(true);
    expect(validatePixKey('RANDOM', '4da03571-bffd-45ef-8c44-20686c487838')).toBe(true);
    expect(maskPixKey('EMAIL', 'financeiro@loja.com.br')).toBe('fi***@loja.com.br');
    expect(maskPixKey('RANDOM', '4da03571-bffd-45ef-8c44-20686c487838')).toBe('4da03571...7838');
  });

  it('gera slug canonico sem acentos e sem separadores duplicados', () => {
    expect(normalizeSlug('  Burger do Ze! Fortaleza  ')).toBe('burger-do-ze-fortaleza');
  });
});
