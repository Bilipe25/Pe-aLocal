import { describe, it, expect } from 'vitest';
import { loginSchema, createUserSchema } from '@/schemas/auth';

describe('Auth Schemas', () => {
  describe('loginSchema', () => {
    it('deve aceitar dados válidos', () => {
      const result = loginSchema.safeParse({
        email: 'dono@demo.com',
        password: 'SenhaDemo123!',
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar e-mail vazio', () => {
      const result = loginSchema.safeParse({
        email: '',
        password: 'SenhaDemo123!',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar e-mail inválido', () => {
      const result = loginSchema.safeParse({
        email: 'nao-e-email',
        password: 'SenhaDemo123!',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar senha vazia', () => {
      const result = loginSchema.safeParse({
        email: 'dono@demo.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar senha curta (< 8 caracteres)', () => {
      const result = loginSchema.safeParse({
        email: 'dono@demo.com',
        password: '1234567',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema', () => {
    it('deve aceitar dados válidos', () => {
      const result = createUserSchema.safeParse({
        email: 'novo@demo.com',
        name: 'Novo Usuário',
        password: 'SenhaForte123!',
      });
      expect(result.success).toBe(true);
    });

    it('deve rejeitar nome muito curto', () => {
      const result = createUserSchema.safeParse({
        email: 'novo@demo.com',
        name: 'A',
        password: 'SenhaForte123!',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar senha muito longa (> 128 caracteres)', () => {
      const result = createUserSchema.safeParse({
        email: 'novo@demo.com',
        name: 'Teste',
        password: 'a'.repeat(129),
      });
      expect(result.success).toBe(false);
    });
  });
});
