import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdvancedReportsAction } from '@/features/reports/actions';
import { AuthorizationError } from '@/server/errors';

const mocks = vi.hoisted(() => ({
  requireAdvancedReportsContext: vi.fn(),
  getAdvancedReports: vi.fn(),
}));

vi.mock('@/features/reports/access', () => ({
  requireAdvancedReportsContext: mocks.requireAdvancedReportsContext,
}));
vi.mock('@/server/services/reports.service', () => ({
  getAdvancedReports: mocks.getAdvancedReports,
}));

describe('Server Action dos relatórios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdvancedReportsContext.mockResolvedValue({
      reportsContext: {
        tenantId: 'tenant-a',
        storeId: 'store-a',
        timeZone: 'America/Fortaleza',
        operationalSlaEnabled: false,
      },
    });
    mocks.getAdvancedReports.mockResolvedValue({ period: { preset: 'TODAY' } });
  });

  it('rejeita período inválido antes de consultar contexto ou dados', async () => {
    const result = await getAdvancedReportsAction({
      preset: 'CUSTOM',
      startLocalDate: '2026-08-19',
      endLocalDate: '2026-08-18',
    });

    expect(result).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.requireAdvancedReportsContext).not.toHaveBeenCalled();
    expect(mocks.getAdvancedReports).not.toHaveBeenCalled();
  });

  it('repete autorização e entitlement antes de executar o serviço', async () => {
    const result = await getAdvancedReportsAction({ preset: 'TODAY' });

    expect(result).toMatchObject({ success: true, data: { period: { preset: 'TODAY' } } });
    expect(mocks.requireAdvancedReportsContext).toHaveBeenCalledOnce();
    expect(mocks.getAdvancedReports).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', storeId: 'store-a' }),
      { preset: 'TODAY' },
    );
  });

  it('retorna erro seguro quando o acesso não é permitido', async () => {
    mocks.requireAdvancedReportsContext.mockRejectedValue(
      new AuthorizationError('Os relatórios avançados não estão habilitados para esta loja.'),
    );

    const result = await getAdvancedReportsAction({ preset: 'LAST_7_DAYS' });

    expect(result).toEqual({
      success: false,
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: 'Os relatórios avançados não estão habilitados para esta loja.',
        details: [],
      },
    });
    expect(mocks.getAdvancedReports).not.toHaveBeenCalled();
  });
});
