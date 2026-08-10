import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import { getPublicStorePwaBySlug } from '@/server/queries/public-store-pwa';

const mocks = vi.hoisted(() => ({
  requestId: 0,
  getDb: vi.fn(),
  unstableCache: vi.fn(),
  storeFindUnique: vi.fn(),
  redirectFindUnique: vi.fn(),
  assetFindMany: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(callback: (...args: Args) => Result) => callback,
  };
});
vi.mock('next/cache', () => ({ unstable_cache: mocks.unstableCache }));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

function store() {
  const publishedConfig = createDefaultCustomization();
  publishedConfig.identity.faviconAssetId = '4da03571-bffd-45ef-8c44-20686c487838';
  return {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: 'Loja Um',
    slug: 'loja-um',
    description: null,
    isActive: true,
    tenant: { status: 'ACTIVE' },
    settings: { primaryColor: '#D9480F', secondaryColor: '#241C15', fontFamily: 'Inter' },
    customization: {
      publishedConfig,
      publishedVersion: 2,
      publishedAt: new Date('2026-08-10T12:00:00Z'),
    },
  };
}

describe('consulta pública PWA da loja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unstableCache.mockImplementation((callback: () => Promise<unknown>) => callback);
    mocks.storeFindUnique.mockResolvedValue(store());
    mocks.redirectFindUnique.mockResolvedValue(null);
    mocks.assetFindMany.mockResolvedValue([
      {
        id: '4da03571-bffd-45ef-8c44-20686c487838',
        assetType: 'FAVICON',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    ]);
    mocks.getDb.mockReturnValue({
      store: { findUnique: mocks.storeFindUnique },
      storeSlugRedirect: { findUnique: mocks.redirectFindUnique },
      storeAsset: { findMany: mocks.assetFindMany },
    });
  });

  it('seleciona publishedConfig sem expor draftConfig', async () => {
    const result = await getPublicStorePwaBySlug('loja-um');

    expect(result?.icon).toEqual({
      src: '/api/store-assets/4da03571-bffd-45ef-8c44-20686c487838',
      sizes: '512x512',
      type: 'image/png',
    });
    const select = mocks.storeFindUnique.mock.calls[0][0].select;
    expect(select.customization.select).toEqual({
      publishedConfig: true,
      publishedVersion: true,
      publishedAt: true,
    });
    expect(JSON.stringify(select)).not.toContain('draftConfig');
  });

  it.each([
    ['image/svg+xml', 512, 512],
    ['image/png', 191, 191],
    ['image/png', 800, 400],
  ])('rejeita ícone inadequado (%s, %dx%d)', async (mimeType, width, height) => {
    mocks.assetFindMany.mockResolvedValue([
      {
        id: '4da03571-bffd-45ef-8c44-20686c487838',
        assetType: 'FAVICON',
        mimeType,
        width,
        height,
      },
    ]);

    expect((await getPublicStorePwaBySlug('loja-um'))?.icon).toBeNull();
  });

  it('rejeita loja ou tenant inativo', async () => {
    mocks.storeFindUnique.mockResolvedValue({ ...store(), isActive: false });
    expect(await getPublicStorePwaBySlug('inativa')).toBeNull();
    expect(mocks.assetFindMany).not.toHaveBeenCalled();
  });

  it('rejeita asset de outro papel mesmo quando o id foi referenciado', async () => {
    mocks.assetFindMany.mockResolvedValue([
      {
        id: '4da03571-bffd-45ef-8c44-20686c487838',
        assetType: 'BANNER',
        mimeType: 'image/png',
        width: 512,
        height: 512,
      },
    ]);

    expect((await getPublicStorePwaBySlug('loja-um'))?.icon).toBeNull();
  });

  it('resolve slug antigo preservando o slug canônico', async () => {
    mocks.storeFindUnique.mockResolvedValue(null);
    mocks.redirectFindUnique.mockResolvedValue({ store: store() });

    const result = await getPublicStorePwaBySlug('loja-antiga');
    expect(result).toMatchObject({ requestedSlug: 'loja-antiga', slug: 'loja-um' });
  });
});
