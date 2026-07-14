import { describe, it, expect } from 'vitest';
import {
  generateSessionToken,
  getSessionExpiration,
  SESSION_MAX_AGE,
} from '@/server/auth/session';

describe('Session Utils', () => {
  describe('generateSessionToken', () => {
    it('deve gerar um token de 64 caracteres hex (32 bytes)', () => {
      const token = generateSessionToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('deve gerar tokens únicos', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      expect(token1).not.toBe(token2);
    });

    it('deve gerar tokens criptograficamente seguros (não repetidos em 1000 iterações)', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        tokens.add(generateSessionToken());
      }
      expect(tokens.size).toBe(1000);
    });
  });

  describe('getSessionExpiration', () => {
    it('deve retornar uma data 7 dias no futuro', () => {
      const before = Date.now();
      const expiration = getSessionExpiration();
      const after = Date.now();

      const expectedMin = before + SESSION_MAX_AGE * 1000;
      const expectedMax = after + SESSION_MAX_AGE * 1000;

      expect(expiration.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(expiration.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('deve retornar um Date válido', () => {
      const expiration = getSessionExpiration();
      expect(expiration).toBeInstanceOf(Date);
      expect(isNaN(expiration.getTime())).toBe(false);
    });
  });

  describe('SESSION_MAX_AGE', () => {
    it('deve ser exatamente 7 dias em segundos', () => {
      expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
      expect(SESSION_MAX_AGE).toBe(604800);
    });
  });
});
