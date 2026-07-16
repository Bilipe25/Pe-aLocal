import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, ValidationError } from '@/server/errors';
import { login, logout, validateCurrentSession } from '@/server/services/auth.service';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
  findUserByAuthUserId: vi.fn(),
  findUserByEmail: vi.fn(),
  linkAuthIdentity: vi.fn(),
  findFirstActiveMembership: vi.fn(),
  createAuditLog: vi.fn(),
  rateLimitCheck: vi.fn(),
  rateLimitReset: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      getClaims: mocks.getClaims,
      signOut: mocks.signOut,
    },
  }),
}));

vi.mock('@/server/repositories/user.repository', () => ({
  findUserByAuthUserId: mocks.findUserByAuthUserId,
  findUserByEmail: mocks.findUserByEmail,
  linkAuthIdentity: mocks.linkAuthIdentity,
}));

vi.mock('@/server/repositories/tenant-member.repository', () => ({
  findFirstActiveMembership: mocks.findFirstActiveMembership,
}));

vi.mock('@/server/repositories/audit-log.repository', () => ({
  createAuditLog: mocks.createAuditLog,
}));

vi.mock('@/server/rate-limit', () => ({
  RATE_LIMITS: { login: { maxAttempts: 5, windowInSeconds: 60 } },
  getRateLimiter: () => ({
    check: mocks.rateLimitCheck,
    reset: mocks.rateLimitReset,
  }),
}));

const profile = {
  id: 'profile-1',
  authUserId: 'auth-1',
  email: 'dono@demo.com',
  name: 'Dono Demo',
  isActive: true,
  emailVerified: true,
};

describe('AuthService com Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitCheck.mockResolvedValue({ allowed: true, remaining: 4 });
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: 'auth-1',
          email: 'dono@demo.com',
          email_confirmed_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    });
    mocks.findUserByAuthUserId.mockResolvedValue(profile);
    mocks.findFirstActiveMembership.mockResolvedValue(null);
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'auth-1' } },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it('rejeita entrada inválida antes de chamar o provedor', async () => {
    await expect(login({ email: 'inválido', password: 'curta' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('aplica rate limit distribuído antes do login', async () => {
    mocks.rateLimitCheck.mockResolvedValue({ allowed: false, remaining: 0 });
    await expect(
      login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('não revela se a identidade existe quando o Supabase rejeita', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error('invalid credentials'),
    });
    await expect(
      login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
    ).rejects.toMatchObject({ message: 'E-mail ou senha incorretos.' });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED' }),
    );
  });

  it('retorna role nula para identidade válida sem membership', async () => {
    await expect(login({ email: 'dono@demo.com', password: 'SenhaDemo123!' })).resolves.toEqual({
      user: { id: 'profile-1', email: 'dono@demo.com', name: 'Dono Demo' },
      tenantId: null,
      storeId: null,
      role: null,
    });
    expect(mocks.rateLimitReset).toHaveBeenCalled();
  });

  it('monta o contexto somente a partir de claims e perfil ativo', async () => {
    mocks.findFirstActiveMembership.mockResolvedValue({
      tenantId: 'tenant-1',
      role: 'MANAGER',
      tenant: { stores: [{ id: 'store-1' }] },
    });
    await expect(validateCurrentSession()).resolves.toEqual({
      userId: 'profile-1',
      authUserId: 'auth-1',
      email: 'dono@demo.com',
      name: 'Dono Demo',
      role: 'MANAGER',
      tenantId: 'tenant-1',
      storeId: 'store-1',
    });

    mocks.getClaims.mockResolvedValueOnce({ data: null, error: new Error('expired') });
    await expect(validateCurrentSession()).resolves.toBeNull();
  });

  it('audita e encerra a sessão Supabase', async () => {
    await logout();
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'profile-1', action: 'LOGOUT' }),
    );
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
