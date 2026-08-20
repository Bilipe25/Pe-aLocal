import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import {
  getStoreOperationalSettings,
  getStoreOverview,
  getStorePaymentSettings,
  getStorefrontDisplaySettings,
} from '@/server/services/store-settings.service';

const mocks = vi.hoisted(() => ({
  requireTenantStoreAccess: vi.fn(),
  findStoreOverviewById: vi.fn(),
  findStoreOperationalSettingsById: vi.fn(),
  findStorePaymentSettingsById: vi.fn(),
  findStorefrontDisplaySettingsById: vi.fn(),
  getStoreAvailabilityStateForTenant: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreOverviewById: mocks.findStoreOverviewById,
  findStoreOperationalSettingsById: mocks.findStoreOperationalSettingsById,
  findStorePaymentSettingsById: mocks.findStorePaymentSettingsById,
  findStorefrontDisplaySettingsById: mocks.findStorefrontDisplaySettingsById,
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
      status: 'OPEN',
      configurationVersion: 4,
      settings: {
        minOrderValue: 2000,
        estimatedTime: '30-50 min',
        estimatedTimeMinMinutes: 30,
        estimatedTimeMaxMinutes: 50,
        deliveryEnabled: true,
        pickupEnabled: true,
        acceptsPix: true,
        acceptsCash: true,
        acceptsCardOnDelivery: true,
        pixKeyType: 'EMAIL',
        pixKey: 'financeiro@example.com',
      },
      deliveryZones: [{ id: 'zone-a' }],
    };
    mocks.findStoreOperationalSettingsById.mockResolvedValue(store);

    await expect(getStoreOperationalSettings('store-a')).resolves.toEqual({
      store: {
        id: 'store-a',
        status: 'OPEN',
        configurationVersion: 4,
        settings: {
          minOrderValue: 2000,
          estimatedTime: '30-50 min',
          estimatedTimeMinMinutes: 30,
          estimatedTimeMaxMinutes: 50,
          deliveryEnabled: true,
          pickupEnabled: true,
        },
        hasActiveDeliveryZone: true,
        paymentSummary: {
          acceptsPix: true,
          acceptsCash: true,
          acceptsCardOnDelivery: true,
          acceptsCardInPerson: false,
          pixConfigured: true,
        },
      },
      canEdit: false,
      canViewPayments: false,
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STORE_OPERATIONS,
    );
  });

  it('retorna preferências da vitrine ao MANAGER somente para leitura', async () => {
    const store = {
      id: 'store-a',
      configurationVersion: 3,
      settings: {
        showEstimatedTimeInHero: true,
        showFulfillmentInHero: false,
        showMinOrderValueInHero: true,
        showOpeningHoursInHero: false,
        showFullAddressInStoreInfo: false,
      },
      openingHours: [],
      address: null,
    };
    mocks.findStorefrontDisplaySettingsById.mockResolvedValue(store);

    await expect(getStorefrontDisplaySettings('store-a')).resolves.toEqual({
      store,
      canEdit: false,
    });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STOREFRONT_DISPLAY,
    );
    expect(mocks.findStorefrontDisplaySettingsById).toHaveBeenCalledWith('store-a', 'tenant-a');
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

  it('nunca devolve a chave Pix completa para a pÃ¡gina de pagamentos', async () => {
    mocks.requireTenantStoreAccess.mockResolvedValueOnce({
      session: { tenantId: 'tenant-a', tenantRole: 'OWNER' },
      store: { id: 'store-a' },
    });
    mocks.findStorePaymentSettingsById.mockResolvedValueOnce({
      id: 'store-a',
      configurationVersion: 9,
      settings: {
        acceptsPix: true,
        acceptsCash: true,
        acceptsCardOnDelivery: false,
        pixKeyType: 'EMAIL',
        pixKey: 'financeiro@example.com',
        pixRecipient: 'PedidoLocal',
        pixBank: 'Banco Teste',
        pixInstructions: 'Envie o comprovante.',
      },
    });

    const result = await getStorePaymentSettings('store-a');

    expect(JSON.stringify(result)).not.toContain('financeiro@example.com');
    expect(result.store.settings).toMatchObject({
      acceptsPix: true,
      hasPixKey: true,
      hasValidPixConfiguration: true,
      pixRecipient: 'PedidoLocal',
    });
    expect(result.store.settings).not.toHaveProperty('pixKey');
    expect(result.canEdit).toBe(true);
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
      _count: { categories: 2, products: 8, deliveryZones: 3 },
    };
    mocks.findStoreOverviewById.mockResolvedValue(store);

    const result = await getStoreOverview('store-a');

    expect(result.store).toEqual({
      id: 'store-a',
      name: 'Loja A',
      slug: 'loja-a',
      status: 'OPEN',
      isActive: true,
      tenant: { status: 'ACTIVE' },
      address: { id: 'address-a' },
      openingHours: [{ dayOfWeek: 'MONDAY' }],
    });
    expect(result.summary).toEqual({
      categoryCount: 2,
      productCount: 8,
      deliveryZoneCount: 3,
      activeHourCount: 1,
      hasAddress: true,
    });
    expect(result.store).not.toHaveProperty('_count');
    expect(result.store).not.toHaveProperty('settings');
    expect(result.availability).toMatchObject({ acceptingOrders: true, state: 'OPEN' });
    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STORE_OVERVIEW,
    );
  });
});
