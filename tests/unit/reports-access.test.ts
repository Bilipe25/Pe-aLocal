import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAdvancedReportsContext } from '@/features/reports/access';
import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));

function activeContext(advancedReportsEnabled: boolean) {
  return {
    session: { tenantId: 'tenant-a' },
    store: {
      id: 'store-a',
      timeZone: 'America/Fortaleza',
      entitlement: {
        advancedReportsEnabled,
        operationalSlaEnabled: true,
      },
    },
  };
}

describe('gate server-side dos relatórios avançados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exige a permissão canônica e reutiliza o entitlement existente', async () => {
    mocks.requireActiveStoreContext.mockResolvedValue(activeContext(true));

    const result = await requireAdvancedReportsContext();

    expect(mocks.requireActiveStoreContext).toHaveBeenCalledWith(Permission.VIEW_REPORTS);
    expect(result.reportsContext).toEqual({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      timeZone: 'America/Fortaleza',
      operationalSlaEnabled: true,
    });
  });

  it('bloqueia a capability quando advancedReportsEnabled está desligado', async () => {
    mocks.requireActiveStoreContext.mockResolvedValue(activeContext(false));

    await expect(requireAdvancedReportsContext()).rejects.toEqual(
      new AuthorizationError('Os relatórios avançados não estão habilitados para esta loja.'),
    );
  });

  it('propaga a negação de RBAC antes de montar o contexto dos relatórios', async () => {
    const denied = new AuthorizationError('Você não tem permissão para visualizar relatórios.');
    mocks.requireActiveStoreContext.mockRejectedValue(denied);

    await expect(requireAdvancedReportsContext()).rejects.toBe(denied);
  });
});
