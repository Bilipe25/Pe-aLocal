import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError, RateLimitError, ValidationError } from '@/server/errors';
import { login, logout, validateCurrentSession } from '@/server/services/auth.service';

const mocks = vi.hoisted(() => ({
  verifyPassword: vi.fn(),
  generateSessionToken: vi.fn(),
  getSessionExpiration: vi.fn(),
  setSessionCookie: vi.fn(),
  getSessionToken: vi.fn(),
  clearSessionCookie: vi.fn(),
  findUserByEmail: vi.fn(),
  createSession: vi.fn(),
  findValidSession: vi.fn(),
  deleteSessionByToken: vi.fn(),
  findFirstActiveMembership: vi.fn(),
  createAuditLog: vi.fn(),
  rateLimitCheck: vi.fn(),
  rateLimitReset: vi.fn(),
}));

vi.mock('@/server/auth/password', () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock('@/server/auth/session', () => ({
  generateSessionToken: mocks.generateSessionToken,
  getSessionExpiration: mocks.getSessionExpiration,
  setSessionCookie: mocks.setSessionCookie,
  getSessionToken: mocks.getSessionToken,
  clearSessionCookie: mocks.clearSessionCookie,
}));

vi.mock('@/server/repositories/user.repository', () => ({
  findUserByEmail: mocks.findUserByEmail,
}));

vi.mock('@/server/repositories/session.repository', () => ({
  createSession: mocks.createSession,
  findValidSession: mocks.findValidSession,
  deleteSessionByToken: mocks.deleteSessionByToken,
}));

vi.mock('@/server/repositories/tenant-member.repository', () => ({
  findFirstActiveMembership: mocks.findFirstActiveMembership,
}));

vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));

vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: {
    login: { maxAttempts: 5, windowInSeconds: 900 },
  },
  getRateLimiter: () => ({
    check: mocks.rateLimitCheck,
    reset: mocks.rateLimitReset,
  }),
}));

const activeUser = {
  id: 'user-1',
  email: 'dono@demo.com',
  name: 'Dono Demo',
  passwordHash: 'argon-hash',
  isActive: true,
};

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 900_000,
    });
    mocks.findUserByEmail.mockResolvedValue(activeUser);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.generateSessionToken.mockReturnValue('session-token');
    mocks.getSessionExpiration.mockReturnValue(new Date('2030-01-01T00:00:00.000Z'));
    mocks.findFirstActiveMembership.mockResolvedValue(null);
  });

  describe('login', () => {
    it('rejeita dados inválidos antes de consultar dependências', async () => {
      await expect(login({ email: 'invalido', password: 'curta' })).rejects.toBeInstanceOf(
        ValidationError,
      );

      expect(mocks.rateLimitCheck).not.toHaveBeenCalled();
      expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    });

    it('bloqueia tentativas acima do limite', async () => {
      mocks.rateLimitCheck.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 900_000,
      });

      await expect(
        login({ email: 'Dono@Demo.com', password: 'SenhaDemo123!' }, { ipAddress: '127.0.0.1' }),
      ).rejects.toBeInstanceOf(RateLimitError);

      expect(mocks.rateLimitCheck).toHaveBeenCalledWith({
        identifier: 'login:127.0.0.1:dono@demo.com',
        maxAttempts: 5,
        windowInSeconds: 900,
      });
      expect(mocks.findUserByEmail).not.toHaveBeenCalled();
    });

    it('usa a mesma mensagem para usuário ausente, inativo e senha incorreta', async () => {
      mocks.findUserByEmail.mockResolvedValueOnce(null);
      await expect(
        login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
      ).rejects.toMatchObject({
        message: 'E-mail ou senha incorretos.',
      });

      mocks.findUserByEmail.mockResolvedValueOnce({ ...activeUser, isActive: false });
      await expect(
        login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
      ).rejects.toBeInstanceOf(AuthenticationError);

      mocks.findUserByEmail.mockResolvedValueOnce(activeUser);
      mocks.verifyPassword.mockResolvedValueOnce(false);
      await expect(
        login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
      ).rejects.toMatchObject({
        message: 'E-mail ou senha incorretos.',
      });

      expect(mocks.createAuditLog).toHaveBeenCalledTimes(3);
      expect(mocks.createSession).not.toHaveBeenCalled();
    });

    it('cria a sessão e retorna o contexto ativo do tenant', async () => {
      mocks.findFirstActiveMembership.mockResolvedValue({
        tenantId: 'tenant-1',
        role: 'OWNER',
        tenant: { stores: [{ id: 'store-1' }] },
      });

      const result = await login(
        { email: 'Dono@Demo.com', password: 'SenhaDemo123!' },
        { ipAddress: '127.0.0.1', userAgent: 'Vitest' },
      );

      expect(mocks.findUserByEmail).toHaveBeenCalledWith('dono@demo.com');
      expect(mocks.rateLimitReset).toHaveBeenCalledWith('login:127.0.0.1:dono@demo.com');
      expect(mocks.createSession).toHaveBeenCalledWith({
        userId: 'user-1',
        token: 'session-token',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      });
      expect(mocks.setSessionCookie).toHaveBeenCalledWith('session-token');
      expect(result).toEqual({
        user: { id: 'user-1', email: 'dono@demo.com', name: 'Dono Demo' },
        tenantId: 'tenant-1',
        storeId: 'store-1',
        role: 'OWNER',
      });
    });
  });

  describe('logout', () => {
    it('sempre limpa o cookie, mesmo sem token', async () => {
      mocks.getSessionToken.mockResolvedValue(null);

      await logout();

      expect(mocks.deleteSessionByToken).not.toHaveBeenCalled();
      expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
    });

    it('audita e revoga uma sessão existente', async () => {
      mocks.getSessionToken.mockResolvedValue('session-token');
      mocks.findValidSession.mockResolvedValue({ userId: 'user-1' });

      await logout();

      expect(mocks.createAuditLog).toHaveBeenCalledWith({
        userId: 'user-1',
        action: 'LOGOUT',
        entity: 'User',
        entityId: 'user-1',
      });
      expect(mocks.deleteSessionByToken).toHaveBeenCalledWith('session-token');
      expect(mocks.clearSessionCookie).toHaveBeenCalledOnce();
    });
  });

  describe('validateCurrentSession', () => {
    it('retorna null sem token ou para usuário inativo', async () => {
      mocks.getSessionToken.mockResolvedValueOnce(null);
      await expect(validateCurrentSession()).resolves.toBeNull();

      mocks.getSessionToken.mockResolvedValueOnce('session-token');
      mocks.findValidSession.mockResolvedValueOnce({
        userId: 'user-1',
        user: { ...activeUser, isActive: false },
      });
      await expect(validateCurrentSession()).resolves.toBeNull();
    });

    it('retorna o contexto completo de uma sessão válida', async () => {
      mocks.getSessionToken.mockResolvedValue('session-token');
      mocks.findValidSession.mockResolvedValue({
        userId: 'user-1',
        user: activeUser,
      });
      mocks.findFirstActiveMembership.mockResolvedValue({
        tenantId: 'tenant-1',
        role: 'MANAGER',
        tenant: { stores: [{ id: 'store-1' }] },
      });

      await expect(validateCurrentSession()).resolves.toEqual({
        userId: 'user-1',
        email: 'dono@demo.com',
        name: 'Dono Demo',
        role: 'MANAGER',
        tenantId: 'tenant-1',
        storeId: 'store-1',
      });
    });
  });
});
