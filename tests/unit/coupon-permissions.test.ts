import { describe, expect, it } from 'vitest';

import { hasTenantPermission, Permission, TenantRole } from '@/server/permissions';

describe('permissões administrativas de cupons', () => {
  it('permite ao OWNER consultar e editar', () => {
    expect(hasTenantPermission(TenantRole.OWNER, Permission.VIEW_COUPONS)).toBe(true);
    expect(hasTenantPermission(TenantRole.OWNER, Permission.MANAGE_COUPONS)).toBe(true);
  });

  it('mantém o MANAGER somente leitura', () => {
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.VIEW_COUPONS)).toBe(true);
    expect(hasTenantPermission(TenantRole.MANAGER, Permission.MANAGE_COUPONS)).toBe(false);
  });

  it('não concede acesso ao ATTENDANT', () => {
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.VIEW_COUPONS)).toBe(false);
    expect(hasTenantPermission(TenantRole.ATTENDANT, Permission.MANAGE_COUPONS)).toBe(false);
  });
});
