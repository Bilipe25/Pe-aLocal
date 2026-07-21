import { describe, expect, it } from 'vitest';
import {
  hasPlatformPermission,
  hasTenantPermission,
  isSuperAdmin,
  isTenantAdmin,
  isTenantRoleAtLeast,
  Permission,
  PlatformRole,
  TenantRole,
} from '@/server/permissions';

describe('Permissions', () => {
  it('separa permissões de plataforma das permissões de tenant', () => {
    expect(hasPlatformPermission(PlatformRole.SUPER_ADMIN, Permission.VIEW_TENANTS)).toBe(true);
    expect(hasPlatformPermission(PlatformRole.USER, Permission.VIEW_TENANTS)).toBe(false);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.MANAGE_CATALOG)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.VIEW_TENANTS)).toBe(false);
  });

  it('não concede permissões de tenant ao SUPER_ADMIN', () => {
    expect(hasPlatformPermission(PlatformRole.SUPER_ADMIN, Permission.MANAGE_CATALOG)).toBe(false);
  });

  it('mantém a hierarquia dos papéis de tenant', () => {
    expect(isTenantAdmin(TenantRole.OWNER)).toBe(true);
    expect(isTenantAdmin(TenantRole.MANAGER)).toBe(true);
    expect(isTenantAdmin(TenantRole.ATTENDANT)).toBe(false);
    expect(isTenantRoleAtLeast(TenantRole.OWNER, TenantRole.MANAGER)).toBe(true);
    expect(isTenantRoleAtLeast(TenantRole.ATTENDANT, TenantRole.MANAGER)).toBe(false);
  });

  it('concede ao OWNER todas as configurações da loja', () => {
    expect(hasTenantPermission(TenantRole.OWNER, Permission.EDIT_STORE_GENERAL)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.EDIT_STORE_OPERATIONS)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.EDIT_PAYMENT_SETTINGS)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.CHANGE_STORE_STATUS)).toBe(true);
  });

  it('mantém o MANAGER somente leitura em operações e sem acesso ao Pix', () => {
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.VIEW_STORE_OPERATIONS)).toBe(true);
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.EDIT_STORE_OPERATIONS)).toBe(false);
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.VIEW_PAYMENT_SETTINGS)).toBe(false);
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.EDIT_STORE_HOURS)).toBe(true);
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.CHANGE_STORE_STATUS)).toBe(false);
  });

  it('limita ATTENDANT ao resumo e à leitura operacional necessária', () => {
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_STORE_OVERVIEW)).toBe(true);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_STORE_OPERATIONS)).toBe(true);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_STORE_GENERAL)).toBe(false);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_STORE_ADDRESS)).toBe(false);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_PAYMENT_SETTINGS)).toBe(false);
  });

  it('reconhece somente o papel de plataforma SUPER_ADMIN', () => {
    expect(isSuperAdmin(PlatformRole.SUPER_ADMIN)).toBe(true);
    expect(isSuperAdmin(PlatformRole.USER)).toBe(false);
  });
});
