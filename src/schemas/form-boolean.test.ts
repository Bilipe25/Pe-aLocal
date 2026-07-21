import { describe, it, expect } from 'vitest';
import { formBooleanSchema, formBooleanWithDefault } from '@/schemas/form-boolean';

// =============================================================================
// formBooleanSchema — Testes
// =============================================================================
// Garante que valores de FormData são convertidos corretamente.
// z.coerce.boolean() converte "false" → true (BUG).
// formBooleanSchema converte "false" → false (CORRETO).
// =============================================================================

describe('formBooleanSchema', () => {
  describe('valores que devem resultar em true', () => {
    it('boolean true → true', () => {
      expect(formBooleanSchema.parse(true)).toBe(true);
    });

    it('"true" (string) → true', () => {
      expect(formBooleanSchema.parse('true')).toBe(true);
    });

    it('"on" (checkbox HTML) → true', () => {
      expect(formBooleanSchema.parse('on')).toBe(true);
    });
  });

  describe('valores que devem resultar em false', () => {
    it('boolean false → false', () => {
      expect(formBooleanSchema.parse(false)).toBe(false);
    });

    it('"false" (string) → false', () => {
      // REGRESSÃO: z.coerce.boolean() retorna true aqui. Este teste deve passar.
      expect(formBooleanSchema.parse('false')).toBe(false);
    });

    it('"off" → false', () => {
      expect(formBooleanSchema.parse('off')).toBe(false);
    });

    it('string vazia → false', () => {
      expect(formBooleanSchema.parse('')).toBe(false);
    });

    it('undefined → false', () => {
      expect(formBooleanSchema.parse(undefined)).toBe(false);
    });

    it('null → false', () => {
      expect(formBooleanSchema.parse(null)).toBe(false);
    });

    it('número 0 → false', () => {
      expect(formBooleanSchema.parse(0)).toBe(false);
    });

    it('string "0" → false', () => {
      expect(formBooleanSchema.parse('0')).toBe(false);
    });

    it('string "1" → false (não é "true" ou "on")', () => {
      expect(formBooleanSchema.parse('1')).toBe(false);
    });
  });

  describe('comparação com z.coerce.boolean() para evidenciar o bug', () => {
    it('demonstra que "false" seria convertido incorretamente por z.coerce.boolean()', () => {
      // Boolean("false") === true — isso é o bug que corrigimos
      expect(Boolean('false')).toBe(true);

      // Nossa implementação corrige isso:
      expect(formBooleanSchema.parse('false')).toBe(false);
    });
  });
});

describe('formBooleanWithDefault', () => {
  describe('com default true', () => {
    const schema = formBooleanWithDefault(true);

    it('undefined → default (true)', () => {
      expect(schema.parse(undefined)).toBe(true);
    });

    it('null → default (true)', () => {
      expect(schema.parse(null)).toBe(true);
    });

    it('"true" → true', () => {
      expect(schema.parse('true')).toBe(true);
    });

    it('"false" → false (override do default)', () => {
      expect(schema.parse('false')).toBe(false);
    });
  });

  describe('com default false', () => {
    const schema = formBooleanWithDefault(false);

    it('undefined → default (false)', () => {
      expect(schema.parse(undefined)).toBe(false);
    });

    it('"true" → true (override do default)', () => {
      expect(schema.parse('true')).toBe(true);
    });

    it('"on" → true', () => {
      expect(schema.parse('on')).toBe(true);
    });
  });
});
