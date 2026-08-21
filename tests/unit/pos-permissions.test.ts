import { describe, expect, it } from 'vitest';

import { hasTenantPermission, Permission, TenantRole } from '@/server/permissions';

describe('RBAC do PDV', () => {
  it.each([TenantRole.OWNER, TenantRole.MANAGER, TenantRole.ATTENDANT])(
    '%s pode operar o PDV',
    (role) => {
      expect(hasTenantPermission(role, Permission.OPERATE_POS)).toBe(true);
    },
  );
});
