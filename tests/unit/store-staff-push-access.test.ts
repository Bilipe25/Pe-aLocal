import { describe, expect, it } from 'vitest';

import {
  hasStoreStaffPushPermission,
  isStoreStaffPushAssociationAuthorized,
} from '@/server/services/store-staff-push-access';

const association = {
  disabledAt: null,
  membership: {
    isActive: true,
    role: 'OWNER' as const,
    tenant: { status: 'ACTIVE' },
    user: { isActive: true },
  },
  store: { isActive: true },
  subscription: { revokedAt: null, expirationTime: null },
};

describe('autorizaÃ§Ã£o Merchant Push', () => {
  it('exige simultaneamente visualizaÃ§Ã£o da Central e dos detalhes', () => {
    expect(hasStoreStaffPushPermission('OWNER')).toBe(true);
    expect(hasStoreStaffPushPermission('ATTENDANT')).toBe(true);
  });

  it('revalida usuÃ¡rio, membership, tenant, loja e inscriÃ§Ã£o', () => {
    expect(isStoreStaffPushAssociationAuthorized(association)).toBe(true);
    expect(
      isStoreStaffPushAssociationAuthorized({
        ...association,
        membership: { ...association.membership, isActive: false },
      }),
    ).toBe(false);
    expect(
      isStoreStaffPushAssociationAuthorized({
        ...association,
        subscription: { revokedAt: new Date(), expirationTime: null },
      }),
    ).toBe(false);
    expect(
      isStoreStaffPushAssociationAuthorized({
        ...association,
        subscription: { revokedAt: null, expirationTime: new Date('2026-01-01') },
      }),
    ).toBe(false);
  });
});
