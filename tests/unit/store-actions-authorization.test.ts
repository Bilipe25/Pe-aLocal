import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  toggleStoreStatusAction,
  updatePixConfigAction,
  updateStoreSettingsAction,
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
    await expect(updateStoreSettingsAction('store-a', new FormData())).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_STORE_OPERATIONS,
    );
  });

  it('protege a chave Pix com permissÃ£o especÃ­fica', async () => {
    await expect(updatePixConfigAction('store-a', new FormData())).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.EDIT_PAYMENT_SETTINGS,
    );
  });

  it('protege mudanÃ§as de status no servidor', async () => {
    await expect(toggleStoreStatusAction('store-a', 'PAUSED')).resolves.toMatchObject({
      success: false,
      error: { code: 'AUTHORIZATION_ERROR' },
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.CHANGE_STORE_STATUS,
    );
  });
});
