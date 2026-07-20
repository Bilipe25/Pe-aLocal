import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError, RateLimitError, ValidationError } from '@/server/errors';
import {
  login,
  logout,
  resolvePostLoginDestination,
  validateCurrentSession,
} from '@/server/services/auth.service';

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
  getRateLimiter: () => ({ check: mocks.rateLimitCheck, reset: mocks.rateLimitReset }),
}));

const profile = {
  id: 'profile-1',
  authUserId: 'auth-1',
  email: 'dono@demo.com',
  name: 'Dono Demo',
  platformRole: 'USER',
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
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'auth-1' } }, error: null });
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

  it('não transforma usuário sem membership em administrador', async () => {
    await expect(login({ email: 'dono@demo.com', password: 'SenhaDemo123!' })).resolves.toEqual({
      user: { id: 'profile-1', email: 'dono@demo.com', name: 'Dono Demo' },
      platformRole: 'USER',
      tenantRole: null,
      tenantId: null,
      storeId: null,
      destination: '/access-pending',
    });
  });

  it('SUPER_ADMIN não depende de tenant e segue para /admin', async () => {
    mocks.findUserByAuthUserId.mockResolvedValue({
      ...profile,
      email: 'platform-admin@example.test',
      platformRole: 'SUPER_ADMIN',
    });
    await expect(
      login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
    ).resolves.toMatchObject({
      platformRole: 'SUPER_ADMIN',
      tenantRole: null,
      tenantId: null,
      destination: '/admin',
    });
    expect(mocks.findFirstActiveMembership).not.toHaveBeenCalled();
  });

  it('sessão SUPER_ADMIN ignora memberships e mantém contexto de tenant vazio', async () => {
    mocks.findUserByAuthUserId.mockResolvedValue({
      ...profile,
      email: 'another-admin@example.test',
      platformRole: 'SUPER_ADMIN',
    });
    mocks.findFirstActiveMembership.mockResolvedValue({
      tenantId: 'tenant-indevido',
      role: 'OWNER',
      tenant: { stores: [{ id: 'store-indevida' }] },
    });

    await expect(validateCurrentSession()).resolves.toMatchObject({
      email: 'another-admin@example.test',
      platformRole: 'SUPER_ADMIN',
      tenantRole: null,
      tenantId: null,
      storeId: null,
    });
    expect(mocks.findFirstActiveMembership).not.toHaveBeenCalled();
  });

  it('monta os papéis independentemente a partir do perfil e membership', async () => {
    mocks.findFirstActiveMembership.mockResolvedValue({
      tenantId: 'tenant-1',
      role: 'MANAGER',
    });
    await expect(validateCurrentSession()).resolves.toEqual({
      userId: 'profile-1',
      authUserId: 'auth-1',
      email: 'dono@demo.com',
      name: 'Dono Demo',
      platformRole: 'USER',
      tenantRole: 'MANAGER',
      tenantId: 'tenant-1',
      storeId: null,
    });

    mocks.getClaims.mockResolvedValueOnce({ data: null, error: new Error('expired') });
    await expect(validateCurrentSession()).resolves.toBeNull();
  });

  it('bloqueia usuário inativo', async () => {
    mocks.findUserByAuthUserId.mockResolvedValue({ ...profile, isActive: false });
    await expect(validateCurrentSession()).resolves.toBeNull();
    await expect(
      login({ email: 'dono@demo.com', password: 'SenhaDemo123!' }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejeita open redirect e limita o destino à área autorizada', () => {
    expect(
      resolvePostLoginDestination(
        { platformRole: 'SUPER_ADMIN', tenantId: null },
        '//evil.example',
      ),
    ).toBe('/admin');
    expect(
      resolvePostLoginDestination(
        { platformRole: 'USER', tenantId: 'tenant-1' },
        'https://evil.example',
      ),
    ).toBe('/dashboard');
    expect(
      resolvePostLoginDestination({ platformRole: 'USER', tenantId: 'tenant-1' }, '/admin'),
    ).toBe('/dashboard');
  });

  it('audita e encerra a sessão Supabase', async () => {
    await logout();
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'profile-1', action: 'LOGOUT' }),
    );
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
