import { describe, it, expect } from 'vitest';
import { hasPermission, isTenantAdmin, isSuperAdmin, isRoleAtLeast, Role, Permission } from '@/server/permissions';

describe('Permissions', () => {
  describe('SUPER_ADMIN', () => {
    it('deve ter permissão de visualizar tenants', () => {
      expect(hasPermission(Role.SUPER_ADMIN, Permission.VIEW_TENANTS)).toBe(true);
    });

    it('não deve ter permissão de gerenciar catálogo', () => {
      expect(hasPermission(Role.SUPER_ADMIN, Permission.MANAGE_CATALOG)).toBe(false);
    });
  });

  describe('OWNER', () => {
    it('deve ter todas as permissões do tenant', () => {
      expect(hasPermission(Role.OWNER, Permission.CONFIGURE_STORE)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_TEAM)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_CATALOG)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.MANAGE_ORDERS)).toBe(true);
      expect(hasPermission(Role.OWNER, Permission.VIEW_REPORTS)).toBe(true);
    });

    it('não deve ter permissões de SUPER_ADMIN', () => {
      expect(hasPermission(Role.OWNER, Permission.VIEW_TENANTS)).toBe(false);
      expect(hasPermission(Role.OWNER, Permission.SUSPEND_TENANT)).toBe(false);
    });
  });

  describe('MANAGER', () => {
    it('deve gerenciar catálogo e pedidos', () => {
      expect(hasPermission(Role.MANAGER, Permission.MANAGE_CATALOG)).toBe(true);
      expect(hasPermission(Role.MANAGER, Permission.MANAGE_ORDERS)).toBe(true);
    });

    it('não deve gerenciar equipe', () => {
      expect(hasPermission(Role.MANAGER, Permission.MANAGE_TEAM)).toBe(false);
    });
  });

  describe('ATTENDANT', () => {
    it('deve visualizar e aceitar pedidos', () => {
      expect(hasPermission(Role.ATTENDANT, Permission.VIEW_ORDERS)).toBe(true);
      expect(hasPermission(Role.ATTENDANT, Permission.ACCEPT_ORDERS)).toBe(true);
    });

    it('não deve gerenciar catálogo', () => {
      expect(hasPermission(Role.ATTENDANT, Permission.MANAGE_CATALOG)).toBe(false);
    });
  });

  describe('isTenantAdmin', () => {
    it('OWNER e MANAGER são admin de tenant', () => {
      expect(isTenantAdmin(Role.OWNER)).toBe(true);
      expect(isTenantAdmin(Role.MANAGER)).toBe(true);
    });

    it('ATTENDANT não é admin de tenant', () => {
      expect(isTenantAdmin(Role.ATTENDANT)).toBe(false);
    });
  });

  describe('isSuperAdmin', () => {
    it('apenas SUPER_ADMIN é super admin', () => {
      expect(isSuperAdmin(Role.SUPER_ADMIN)).toBe(true);
      expect(isSuperAdmin(Role.OWNER)).toBe(false);
    });
  });

  describe('isRoleAtLeast', () => {
    it('OWNER deve ser >= MANAGER', () => {
      expect(isRoleAtLeast(Role.OWNER, Role.MANAGER)).toBe(true);
    });

    it('ATTENDANT não deve ser >= MANAGER', () => {
      expect(isRoleAtLeast(Role.ATTENDANT, Role.MANAGER)).toBe(false);
    });

    it('um role deve ser >= a si mesmo', () => {
      expect(isRoleAtLeast(Role.MANAGER, Role.MANAGER)).toBe(true);
    });
  });
});
