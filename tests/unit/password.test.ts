import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/server/auth/password';

describe('Password Hashing (Argon2)', () => {
  it('deve gerar um hash válido', async () => {
    const hash = await hashPassword('SenhaDemo123!');
    expect(hash).toBeTruthy();
    expect(hash).toContain('$argon2id$');
    expect(hash.length).toBeGreaterThan(50);
  });

  it('deve gerar hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const hash1 = await hashPassword('SenhaDemo123!');
    const hash2 = await hashPassword('SenhaDemo123!');
    expect(hash1).not.toBe(hash2);
  });

  it('deve verificar corretamente uma senha válida', async () => {
    const hash = await hashPassword('MinhaS3nha!');
    const isValid = await verifyPassword('MinhaS3nha!', hash);
    expect(isValid).toBe(true);
  });

  it('deve rejeitar uma senha incorreta', async () => {
    const hash = await hashPassword('SenhaCorreta');
    const isValid = await verifyPassword('SenhaErrada', hash);
    expect(isValid).toBe(false);
  });

  it('deve retornar false para hash corrompido', async () => {
    const isValid = await verifyPassword('qualquer', 'hash-invalido');
    expect(isValid).toBe(false);
  });

  it('deve retornar false para string vazia como hash', async () => {
    const isValid = await verifyPassword('senha', '');
    expect(isValid).toBe(false);
  });
});
