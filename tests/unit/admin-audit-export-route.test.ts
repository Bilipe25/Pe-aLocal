import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getAdminAuditExportData: vi.fn() }));

vi.mock('@/server/services/admin.service', () => ({
  getAdminAuditExportData: mocks.getAdminAuditExportData,
}));

import { GET } from '@/app/(admin)/admin/audit/export/route';

describe('exportação da auditoria administrativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminAuditExportData.mockResolvedValue({
      logs: [
        {
          createdAt: new Date('2026-08-10T12:00:00Z'),
          action: 'CUSTOMIZATION_PUBLISHED',
          entity: 'StoreCustomization',
          entityId: 'customization-1',
          tenant: { name: 'Tenant Um' },
          store: { name: 'Loja Um', slug: 'loja-um' },
          user: { email: 'admin@example.com' },
          metadata: { reason: 'Campanha, agosto' },
        },
      ],
    });
  });

  it('gera CSV privado, filtrado e seguro para campos com vírgula', async () => {
    const response = await GET(
      new Request('https://example.test/admin/audit/export?action=CUSTOMIZATION_PUBLISHED'),
    );
    const csv = await response.text();

    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(csv).toContain('CUSTOMIZATION_PUBLISHED');
    expect(csv).toContain('Loja Um (/loja-um)');
    expect(csv).toContain('Campanha, agosto');
    expect(mocks.getAdminAuditExportData).toHaveBeenCalledWith({
      query: undefined,
      action: 'CUSTOMIZATION_PUBLISHED',
    });
  });
});
