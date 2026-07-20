import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Permission } from '@/server/permissions';
import {
  evaluateStoreReadiness,
  getStoreReadiness,
  type StoreReadinessSnapshot,
} from '@/server/services/store-readiness.service';

const mocks = vi.hoisted(() => ({
  requireTenantStoreAccess: vi.fn(),
  findStoreReadinessById: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireTenantStoreAccess: mocks.requireTenantStoreAccess,
}));
vi.mock('@/server/repositories/store.repository', () => ({
  findStoreReadinessById: mocks.findStoreReadinessById,
}));

function readySnapshot(overrides: Partial<StoreReadinessSnapshot> = {}): StoreReadinessSnapshot {
  return {
    id: 'store-a',
    tenantId: 'tenant-a',
    name: 'Loja A',
    slug: 'loja-a',
    description: 'Cardápio da Loja A',
    phone: '85999999999',
    whatsapp: '85999999999',
    logoUrl: 'https://assets.example/logo.png',
    coverUrl: null,
    status: 'CLOSED',
    isActive: true,
    timeZone: 'America/Fortaleza',
    configurationVersion: 3,
    tenant: { status: 'ACTIVE' },
    settings: {
      minOrderValue: 2_000,
      deliveryEnabled: true,
      pickupEnabled: true,
      acceptsPix: true,
      acceptsCash: true,
      acceptsCardOnDelivery: true,
      pixKeyType: 'PHONE',
      pixKey: '(85) 99999-9999',
    },
    address: {
      street: 'Rua Um',
      number: '10',
      neighborhood: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60000-000',
    },
    openingHours: [{ dayOfWeek: 'MONDAY', openTime: '18:00', closeTime: '02:00' }],
    scheduleExceptions: [],
    deliveryZones: [{ id: 'zone-a' }],
    categories: [{ id: 'category-a' }],
    products: [{ id: 'product-a' }],
    customization: null,
    ...overrides,
  };
}

describe('StoreReadinessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantStoreAccess.mockResolvedValue({
      session: { tenantId: 'tenant-a', tenantRole: 'OWNER' },
      store: { id: 'store-a' },
    });
  });

  it('considera pronta uma loja com operação, catálogo e dados essenciais válidos', () => {
    const result = evaluateStoreReadiness(readySnapshot());

    expect(result.isReady).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('aceita horário que termina após meia-noite', () => {
    const result = evaluateStoreReadiness(
      readySnapshot({
        openingHours: [{ dayOfWeek: 'FRIDAY', openTime: '18:00', closeTime: '02:00' }],
      }),
    );

    expect(result.blockers.map((item) => item.code)).not.toContain('OPENING_HOURS_INVALID');
  });

  it('retorna bloqueadores estruturados para regras cruzadas inválidas', () => {
    const result = evaluateStoreReadiness(
      readySnapshot({
        isActive: false,
        tenant: { status: 'SUSPENDED' },
        settings: {
          minOrderValue: 2_000,
          deliveryEnabled: false,
          pickupEnabled: false,
          acceptsPix: false,
          acceptsCash: false,
          acceptsCardOnDelivery: false,
          pixKeyType: null,
          pixKey: null,
        },
        openingHours: [],
        categories: [],
      }),
    );

    expect(result.isReady).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'TENANT_NOT_ACTIVE',
        'STORE_INACTIVE',
        'MODALITY_REQUIRED',
        'PAYMENT_METHOD_REQUIRED',
        'CATALOG_REQUIRED',
        'OPENING_HOURS_REQUIRED',
      ]),
    );
    expect(result.blockers.find((item) => item.code === 'MODALITY_REQUIRED')).toMatchObject({
      severity: 'BLOCKER',
      actionHref: '/dashboard/stores/store-a/operations',
    });
  });

  it('bloqueia Pix, entrega, endereço, horário e fuso inválidos', () => {
    const snapshot = readySnapshot({
      settings: {
        ...readySnapshot().settings!,
        pixKeyType: 'EMAIL',
        pixKey: 'email-invalido',
      },
      deliveryZones: [],
      address: null,
      openingHours: [{ dayOfWeek: 'MONDAY', openTime: '25:00', closeTime: '25:00' }],
    });
    const result = evaluateStoreReadiness(snapshot, 'Fuso/Inexistente');

    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'PIX_CONFIGURATION_INVALID',
        'DELIVERY_ZONE_REQUIRED',
        'ADDRESS_REQUIRED',
        'OPENING_HOURS_INVALID',
        'TIMEZONE_INVALID',
      ]),
    );
  });

  it('separa avisos informativos sem impedir a abertura', () => {
    const result = evaluateStoreReadiness(
      readySnapshot({
        phone: null,
        whatsapp: null,
        description: null,
        logoUrl: null,
        coverUrl: null,
        products: [],
        settings: { ...readySnapshot().settings!, minOrderValue: 50_001 },
      }),
    );

    expect(result.isReady).toBe(true);
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'PHONE_MISSING',
        'WHATSAPP_MISSING',
        'DESCRIPTION_MISSING',
        'FEATURED_PRODUCT_MISSING',
        'BRAND_IMAGE_MISSING',
        'MIN_ORDER_VALUE_HIGH',
      ]),
    );
  });

  it('deriva o tenant da sessão antes de consultar a prontidão', async () => {
    const snapshot = readySnapshot();
    mocks.findStoreReadinessById.mockResolvedValue(snapshot);

    await expect(getStoreReadiness('store-a')).resolves.toMatchObject({ isReady: true });

    expect(mocks.requireTenantStoreAccess).toHaveBeenCalledWith(
      'store-a',
      Permission.VIEW_STORE_OVERVIEW,
    );
    expect(mocks.findStoreReadinessById).toHaveBeenCalledWith('store-a', 'tenant-a', undefined);
  });
});
