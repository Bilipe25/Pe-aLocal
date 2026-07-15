import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/server/errors';
import { addTenantMember, createTenantWithOwner } from '@/server/services/tenant.service';

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  emailExists: vi.fn(),
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createTenant: vi.fn(),
  findMembership: vi.fn(),
  createMembership: vi.fn(),
}));

vi.mock('@/server/auth/password', () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock('@/server/repositories/user.repository', () => ({
  emailExists: mocks.emailExists,
  findUserByEmail: mocks.findUserByEmail,
  createUser: mocks.createUser,
}));

vi.mock('@/server/repositories/tenant.repository', () => ({
  createTenant: mocks.createTenant,
}));

vi.mock('@/server/repositories/tenant-member.repository', () => ({
  findMembership: mocks.findMembership,
  createMembership: mocks.createMembership,
}));

describe('TenantService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.emailExists.mockResolvedValue(false);
    mocks.hashPassword.mockResolvedValue('password-hash');
    mocks.createTenant.mockResolvedValue({ id: 'tenant-1', name: 'Lanchonete Demo' });
    mocks.createUser.mockResolvedValue({
      id: 'user-1',
      email: 'dono@demo.com',
      name: 'Dono Demo',
    });
  });

  describe('createTenantWithOwner', () => {
    it('rejeita e-mail já utilizado antes de criar dados', async () => {
      mocks.emailExists.mockResolvedValue(true);

      await expect(
        createTenantWithOwner({
          tenantName: 'Lanchonete Demo',
          ownerEmail: 'dono@demo.com',
          ownerName: 'Dono Demo',
          ownerPassword: 'SenhaDemo123!',
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(mocks.createTenant).not.toHaveBeenCalled();
      expect(mocks.createUser).not.toHaveBeenCalled();
    });

    it('cria tenant, owner e vínculo com papel OWNER', async () => {
      const result = await createTenantWithOwner({
        tenantName: 'Lanchonete Demo',
        ownerEmail: 'dono@demo.com',
        ownerName: 'Dono Demo',
        ownerPassword: 'SenhaDemo123!',
        document: '12345678900',
      });

      expect(mocks.createTenant).toHaveBeenCalledWith({
        name: 'Lanchonete Demo',
        document: '12345678900',
        status: 'ACTIVE',
      });
      expect(mocks.createUser).toHaveBeenCalledWith({
        email: 'dono@demo.com',
        name: 'Dono Demo',
        passwordHash: 'password-hash',
      });
      expect(mocks.createMembership).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'OWNER',
      });
      expect(result).toEqual({
        tenant: { id: 'tenant-1', name: 'Lanchonete Demo' },
        owner: { id: 'user-1', email: 'dono@demo.com', name: 'Dono Demo' },
      });
    });
  });

  describe('addTenantMember', () => {
    it('reutiliza usuário existente sem recalcular senha', async () => {
      mocks.findUserByEmail.mockResolvedValue({ id: 'user-2' });
      mocks.findMembership.mockResolvedValue(null);

      await expect(
        addTenantMember({
          tenantId: 'tenant-1',
          email: 'atendente@demo.com',
          name: 'Atendente',
          password: 'SenhaDemo123!',
          role: 'ATTENDANT',
        }),
      ).resolves.toEqual({ userId: 'user-2' });

      expect(mocks.hashPassword).not.toHaveBeenCalled();
      expect(mocks.createUser).not.toHaveBeenCalled();
      expect(mocks.createMembership).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-2',
        role: 'ATTENDANT',
      });
    });

    it('rejeita usuário que já pertence ao tenant', async () => {
      mocks.findUserByEmail.mockResolvedValue({ id: 'user-2' });
      mocks.findMembership.mockResolvedValue({ id: 'membership-1' });

      await expect(
        addTenantMember({
          tenantId: 'tenant-1',
          email: 'atendente@demo.com',
          name: 'Atendente',
          password: 'SenhaDemo123!',
          role: 'ATTENDANT',
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      expect(mocks.createMembership).not.toHaveBeenCalled();
    });

    it('cria usuário quando o e-mail ainda não existe', async () => {
      mocks.findUserByEmail.mockResolvedValue(null);
      mocks.createUser.mockResolvedValue({ id: 'user-3' });

      await expect(
        addTenantMember({
          tenantId: 'tenant-1',
          email: 'gerente@demo.com',
          name: 'Gerente',
          password: 'SenhaDemo123!',
          role: 'MANAGER',
        }),
      ).resolves.toEqual({ userId: 'user-3' });

      expect(mocks.hashPassword).toHaveBeenCalledWith('SenhaDemo123!');
      expect(mocks.createUser).toHaveBeenCalledWith({
        email: 'gerente@demo.com',
        name: 'Gerente',
        passwordHash: 'password-hash',
      });
      expect(mocks.createMembership).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        userId: 'user-3',
        role: 'MANAGER',
      });
    });
  });
});
