import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  getStoreOperationalSettings,
  getStoreOverview,
  getStorePaymentSettings,
} from '@/server/services/store-settings.service';

const mocks = vi.hoisted(() => ({
  requireTenantStoreAccess: vi.fn(),
  findStoreOverviewById: vi.fn(),
  findStoreOperationalSettingsById: vi.fn(),
  findStorePaymentSettingsById: vi.fn(),
  getStoreAvailabilityStateForTenant: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreOverviewById: mocks.findStoreOverviewById,
  findStoreOperationalSettingsById: mocks.findStoreOperationalSettingsById,
  findStorePaymentSettingsById: mocks.findStorePaymentSettingsById,
}));
vi.mock('@/server/services/store-availability.service', () => ({
  getStoreAvailabilityStateForTenant: mocks.getStoreAvailabilityStateForTenant,
}));
vi.mock('@/server/services/store-readiness.service', () => ({
  getStoreReadinessStateForTenant: vi.fn(),
}));

const managerSession = {
  tenantId: 'tenant-a',
  tenantRole: 'MANAGER',
};

describe('StoreSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantStoreAccess.mockResolvedValue({
      session: managerSession,
      store: { id: 'store-a' },
    });
    mocks.getStoreAvailabilityStateForTenant.mockResolvedValue({
      readiness: { isReady: true, blockers: [], warnings: [], issues: [] },
      availability: {
        acceptingOrders: true,
        state: 'OPEN',
        reason: 'Aberta agora.',
        nextTransitionAt: null,
      },
    });
  });

  it('retorna operaÃ§Ãµes ao MANAGER somente para leitura', async () => {
    const store = {
      id: 'store-a',
      settings: {
        minOrderValue: 2000,
        estimatedTime: '30-50 min',
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
      },
    };
    mocks.findStoreOperationalSettingsById.mockResolvedValue(store);

    await expect(getStoreOperationalSettings('store-a')).resolves.toEqual({
      store,
      canEdit: false,
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STORE_OPERATIONS,
    );
  });

  it('exige permissÃ£o de pagamentos antes de consultar qualquer chave Pix', async () => {
    mocks.requireTenantStoreAccess.mockRejectedValueOnce(new AuthorizationError());

    await expect(getStorePaymentSettings('store-a')).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_PAYMENT_SETTINGS,
    );
    expect(mocks.findStorePaymentSettingsById).not.toHaveBeenCalled();
  });

  it('usa DTO de visÃ£o geral sem chave Pix', async () => {
    const store = {
      id: 'store-a',
      name: 'Loja A',
      slug: 'loja-a',
      status: 'OPEN',
      isActive: true,
      tenant: { status: 'ACTIVE' },
      address: { id: 'address-a' },
      openingHours: [{ dayOfWeek: 'MONDAY' }],
    };
    mocks.findStoreOverviewById.mockResolvedValue(store);

    const result = await getStoreOverview('store-a');

    expect(result.store).toEqual(store);
    expect(result.store).not.toHaveProperty('settings');
    expect(result.availability).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STORE_OVERVIEW,
    );
  });
});
