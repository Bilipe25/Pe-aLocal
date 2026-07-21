import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  findStoreOverviewById,
  findStorePaymentSettingsById,
} from '@/server/repositories/store.repository';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({
  getDb: () => ({ store: { findFirst: mocks.findFirst } }),
}));

describe('DTOs privados da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nÃ£o seleciona a chave Pix na visÃ£o geral', async () => {
    mocks.findFirst.mockResolvedValue(null);

    await findStoreOverviewById('store-a', 'tenant-a');

    const query = mocks.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'store-a', tenantId: 'tenant-a' });
    expect(query.select).not.toHaveProperty('settings');
  });

  it('seleciona dados Pix somente no DTO dedicado de pagamentos', async () => {
    mocks.findFirst.mockResolvedValue(null);

    await findStorePaymentSettingsById('store-a', 'tenant-a');

    const query = mocks.findFirst.mock.calls[0][0];
    expect(query.select.settings.select).toMatchObject({
      pixKeyType: true,
      pixKey: true,
      pixRecipient: true,
    });
  });
});
