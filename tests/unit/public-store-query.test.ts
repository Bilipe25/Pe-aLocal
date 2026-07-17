import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import {
  getPublicCatalog,
  getPublicDeliveryZones,
  getPublicStoreBySlug,
} from '@/server/queries/public-store';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  unstableCache: vi.fn(),
  storeFindUnique: vi.fn(),
  categoryFindMany: vi.fn(),
  deliveryZoneFindMany: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: mocks.unstableCache }));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

function publicStore() {
  return {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: 'Loja 1',
    slug: 'loja-1',
    description: null,
    phone: null,
    whatsapp: null,
    logoUrl: null,
    coverUrl: null,
    status: 'OPEN' as const,
    isActive: true,
    settings: {
      primaryColor: '#D9480F',
      secondaryColor: '#241C15',
      fontFamily: 'Inter',
      minOrderValue: 0,
      estimatedTime: '30-50 min',
      deliveryEnabled: true,
      pickupEnabled: true,
      acceptsPix: true,
      acceptsCash: true,
      acceptsCardOnDelivery: true,
    },
    customization: {
      publishedConfig: createDefaultCustomization(),
      publishedVersion: 2,
      publishedAt: new Date('2026-07-17T15:00:00Z'),
    },
    address: null,
    openingHours: [],
  };
}

describe('queries públicas da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unstableCache.mockImplementation(
      (callback: () => Promise<unknown>) => callback,
    );
    mocks.storeFindUnique.mockResolvedValue(publicStore());
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.deliveryZoneFindMany.mockResolvedValue([]);
    mocks.getDb.mockReturnValue({
      store: { findUnique: mocks.storeFindUnique },
      category: { findMany: mocks.categoryFindMany },
      deliveryZone: { findMany: mocks.deliveryZoneFindMany },
    });
  });

  it('seleciona publishedConfig sem carregar draft ou histórico', async () => {
    const result = await getPublicStoreBySlug('loja-1');
    const query = mocks.storeFindUnique.mock.calls[0][0];
    const customizationSelect = query.select.customization.select;

    expect(customizationSelect).toEqual({
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    });
    expect(customizationSelect).not.toHaveProperty('draftConfig');
    expect(customizationSelect).not.toHaveProperty('revisions');
    expect(result?.customization.config.identity.slogan).toBe('');
  });

  it('isola as tags de store, catálogo e entrega', async () => {
    await getPublicStoreBySlug('loja-1');
    await getPublicCatalog('store-1', 'tenant-1');
    await getPublicDeliveryZones('store-1');

    expect(mocks.unstableCache.mock.calls[0][2].tags).toEqual(['store-slug:loja-1']);
    expect(mocks.unstableCache.mock.calls[1][2].tags).toEqual(['catalog:store-1']);
    expect(mocks.unstableCache.mock.calls[2][2].tags).toEqual(['delivery:store-1']);
  });
});
