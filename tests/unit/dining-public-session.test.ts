import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDiningSessionOrderingHref,
  getPublicDiningSession,
} from '@/server/services/dining-table-session.service';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ diningTableSession: { findUnique: mocks.findUnique } }),
}));

describe('capability pública da sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      id: 'session-a',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      publicToken: 'S'.repeat(43),
      status: 'OPEN',
      version: 4,
      diningTable: {
        id: 'table-12',
        label: 'Mesa 12',
        publicToken: 'Q'.repeat(43),
        isActive: true,
      },
      store: {
        name: 'Hamburgueria do João',
        slug: 'hamburgueria-do-joao',
        entitlement: { dineInQrEnabled: true },
      },
      serviceRequests: [{ type: 'ASSISTANCE' }],
      customerName: 'não pode vazar',
      phone: 'não pode vazar',
      payment: { status: 'PAID' },
    });
  });

  it('retorna somente contexto mínimo e nunca expõe conta ou PII', async () => {
    const dto = await getPublicDiningSession('S'.repeat(43));
    expect(dto).toEqual({
      state: 'OPEN',
      tableLabel: 'Mesa 12',
      storeName: 'Hamburgueria do João',
      continueOrderingHref: `/q/s/${'S'.repeat(43)}/menu`,
      publicOperationsEnabled: true,
      assistanceRequested: true,
      billRequested: false,
    });
    expect(JSON.stringify(dto)).not.toMatch(/customer|phone|payment|total/iu);
  });

  it('resolve o QR atual somente no salto server-side para novo pedido', async () => {
    await expect(getDiningSessionOrderingHref('S'.repeat(43))).resolves.toBe(
      `/q/${'Q'.repeat(43)}`,
    );
    expect((await getPublicDiningSession('S'.repeat(43))).continueOrderingHref).not.toContain(
      'Q'.repeat(43),
    );
  });
});
