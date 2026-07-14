import { describe, it, expect } from 'vitest';
import { slugify, isValidSlug, formatCurrency, formatOrderNumber } from '@/lib/utils';

describe('utils', () => {
  describe('slugify', () => {
    it('deve converter texto para slug', () => {
      expect(slugify('Burger do Zé')).toBe('burger-do-ze');
    });

    it('deve remover acentos', () => {
      expect(slugify('Açaí da Praça')).toBe('acai-da-praca');
    });

    it('deve remover caracteres especiais', () => {
      expect(slugify('Pizza & Cia!')).toBe('pizza-cia');
    });

    it('deve tratar espaços múltiplos', () => {
      expect(slugify('  Burger   King  ')).toBe('burger-king');
    });
  });

  describe('isValidSlug', () => {
    it('deve aceitar slug válido', () => {
      expect(isValidSlug('burger-do-ze')).toBe(true);
    });

    it('deve rejeitar slug reservado', () => {
      expect(isValidSlug('admin')).toBe(false);
      expect(isValidSlug('dashboard')).toBe(false);
      expect(isValidSlug('api')).toBe(false);
      expect(isValidSlug('login')).toBe(false);
    });

    it('deve rejeitar slug muito curto', () => {
      expect(isValidSlug('ab')).toBe(false);
    });

    it('deve rejeitar slug com caracteres inválidos', () => {
      expect(isValidSlug('burger_do_ze')).toBe(false);
      expect(isValidSlug('Burger-Do-Ze')).toBe(false);
    });

    it('deve rejeitar slug começando ou terminando com hífen', () => {
      expect(isValidSlug('-burger')).toBe(false);
      expect(isValidSlug('burger-')).toBe(false);
    });
  });

  describe('formatCurrency', () => {
    it('deve formatar centavos para BRL', () => {
      expect(formatCurrency(4590)).toBe('R$\u00a045,90');
    });

    it('deve formatar zero', () => {
      expect(formatCurrency(0)).toBe('R$\u00a00,00');
    });

    it('deve formatar valores grandes', () => {
      expect(formatCurrency(10000)).toBe('R$\u00a0100,00');
    });
  });

  describe('formatOrderNumber', () => {
    it('deve formatar com zeros à esquerda', () => {
      expect(formatOrderNumber(1)).toBe('0001');
      expect(formatOrderNumber(42)).toBe('0042');
      expect(formatOrderNumber(1024)).toBe('1024');
    });
  });
});
