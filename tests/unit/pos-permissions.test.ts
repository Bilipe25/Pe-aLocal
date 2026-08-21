import { describe, expect, it } from 'vitest';

import { hasTenantPermission, Permission, TenantRole } from '@/server/permissions';

describe('RBAC do PDV', () => {
  it.each([TenantRole.OWNER, TenantRole.MANAGER, TenantRole.ATTENDANT])(
    '%s pode operar o PDV',
    (role) => {
      expect(hasTenantPermission(role, Permission.OPERATE_POS)).toBe(true);
    },
  );

  it.each([TenantRole.OWNER, TenantRole.MANAGER])(
    '%s gerencia terminais/favoritos e aplica desconto manual',
    (role) => {
      expect(hasTenantPermission(role, Permission.MANAGE_POS_TERMINALS)).toBe(true);
      expect(hasTenantPermission(role, Permission.MANAGE_POS_SHORTCUTS)).toBe(true);
      expect(hasTenantPermission(role, Permission.APPLY_POS_MANUAL_DISCOUNT)).toBe(true);
    },
  );

  it('atendente opera, mas não autoriza configuração nem desconto manual', () => {
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.OPERATE_POS)).toBe(true);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.MANAGE_POS_TERMINALS)).toBe(false);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.MANAGE_POS_SHORTCUTS)).toBe(false);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.APPLY_POS_MANUAL_DISCOUNT)).toBe(
      false,
    );
  });
});
