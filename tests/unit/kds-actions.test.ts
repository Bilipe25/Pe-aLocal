import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getKdsSnapshotAction } from '@/features/kds/actions';

const mocks = vi.hoisted(() => ({
  requireContext: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireContext,
}));

vi.mock('@/server/services/kds-query.service', () => ({
  getKdsSnapshot: mocks.getSnapshot,
}));

function context(kdsEnabled: boolean) {
  return {
    session: { tenantId: 'tenant-a' },
    store: {
      id: 'store-a',
      settings: { estimatedTimeMaxMinutes: 35 },
      entitlement: { kdsEnabled },
    },
  };
}

describe('ação de leitura do KDS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockResolvedValue({ lanes: {}, total: 0 });
  });

  it('recusa a superfície quando o entitlement está desabilitado', async () => {
    mocks.requireContext.mockResolvedValue(context(false));

    await expect(getKdsSnapshotAction()).resolves.toEqual({
      success: false,
      error: expect.objectContaining({
        code: 'AUTHORIZATION_ERROR',
        message: 'A Tela da cozinha não está habilitada para esta loja.',
      }),
    });
    expect(mocks.getSnapshot).not.toHaveBeenCalled();
  });

  it('consulta somente a loja ativa habilitada', async () => {
    mocks.requireContext.mockResolvedValue(context(true));

    const result = await getKdsSnapshotAction();

    expect(result.success).toBe(true);
    expect(mocks.getSnapshot).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      estimatedTimeMaxMinutes: 35,
    });
  });
});
