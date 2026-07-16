import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTenantWithOwner } from '@/server/services/tenant.service';

const mocks = vi.hoisted(() => ({
  createAuthUser: vi.fn(),
  emailExists: vi.fn(),
  createTenant: vi.fn(),
  createUser: vi.fn(),
  createMembership: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: mocks.createAuthUser } },
  }),
}));
vi.mock('@/server/repositories/tenant.repository', () => ({
  createTenant: mocks.createTenant,
}));
vi.mock('@/server/repositories/user.repository', () => ({
  emailExists: mocks.emailExists,
  createUser: mocks.createUser,
}));
vi.mock('@/server/repositories/tenant-member.repository', () => ({
  createMembership: mocks.createMembership,
}));

describe('TenantService com Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emailExists.mockResolvedValue(false);
    mocks.createAuthUser.mockResolvedValue({
      data: { user: { id: 'auth-owner' } },
      error: null,
    });
    mocks.createTenant.mockResolvedValue({ id: 'tenant-1', name: 'Demo' });
    mocks.createUser.mockResolvedValue({ id: 'profile-1', email: 'owner@demo.com' });
  });

  it('cria a senha somente no Supabase e persiste apenas o UUID no perfil', async () => {
    await createTenantWithOwner({
      tenantName: 'Demo',
      ownerEmail: 'owner@demo.com',
      ownerName: 'Owner',
      ownerPassword: 'SenhaDemo123!',
    });

    expect(mocks.createAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'owner@demo.com', password: 'SenhaDemo123!' }),
    );
    expect(mocks.createUser).toHaveBeenCalledWith({
      authUserId: 'auth-owner',
      email: 'owner@demo.com',
      name: 'Owner',
    });
    expect(mocks.createMembership).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'profile-1',
      role: 'OWNER',
    });
  });
});
