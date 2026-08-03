import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  removePixConfigurationAction,
  toggleStoreStatusAction,
  updateStorePaymentSettingsAction,
  updateStoreSettingsAction,
  updateStorefrontDisplaySettingsAction,
} from '@/features/stores/actions';
import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';

const mocks = vi.hoisted(() => ({
  requireTenantStoreAccess: vi.fn(),
}));

vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/repositories/store.repository', () => ({}));
vi.mock('@/server/services/store-context.service', () => ({ rememberActiveStore: vi.fn() }));

describe('autorizaÃ§Ã£o das aÃ§Ãµes de configuraÃ§Ã£o', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantStoreAccess.mockRejectedValue(new AuthorizationError());
  });

  it('protege a ediÃ§Ã£o operacional com permissÃ£o especÃ­fica', async () => {
    await expect(updateStoreSettingsAction('store-a', 0, new FormData())).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_STORE_OPERATIONS,
    );
  });

  it('protege pagamentos e remoção do Pix com permissão específica', async () => {
    await expect(
      updateStorePaymentSettingsAction('store-a', 0, new FormData()),
    ).resolves.toMatchObject({ success: false, error: { code: 'AUTHORIZATION_ERROR' } });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_PAYMENT_SETTINGS,
    );

    mocks.requireTenantStoreAccess.mockClear();
    await expect(removePixConfigurationAction('store-a', 0)).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_PAYMENT_SETTINGS,
    );
  });

  it('protege preferências públicas com permissão específica no servidor', async () => {
    await expect(
      updateStorefrontDisplaySettingsAction('store-a', 0, new FormData()),
    ).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_STOREFRONT_DISPLAY,
    );
  });

  it('protege mudanÃ§as de status no servidor', async () => {
    await expect(toggleStoreStatusAction('store-a', 0, 'PAUSED')).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.CHANGE_STORE_STATUS,
    );
  });
});
