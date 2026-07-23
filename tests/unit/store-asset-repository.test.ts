import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isStoreAssetReferenced } from '@/server/repositories/store-asset.repository';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

describe('StoreAssetRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue({ $queryRaw: mocks.queryRaw });
  });

  it('detecta referências exatas em publicado, draft, revisões, banners e produtos', async () => {
    mocks.queryRaw.mockResolvedValue([{ referenced: true }]);
    const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';

    await expect(isStoreAssetReferenced('tenant-1', 'store-1', assetId)).resolves.toBe(true);

    const query = mocks.queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain("'categoryImages'");
    expect(query.sql).toContain('store_customization_revisions');
    expect(query.sql).toContain('store_banners');
    expect(query.sql).toContain('products');
    expect(query.sql).toContain('imageAssetId');
    expect(query.values).toContain(assetId);
    expect(query.values).toContain('tenant-1');
    expect(query.values).toContain('store-1');
  });

  it('permite exclusão quando nenhuma referência exata existe', async () => {
    mocks.queryRaw.mockResolvedValue([{ referenced: false }]);

    await expect(
      isStoreAssetReferenced('tenant-1', 'store-1', 'asset-without-reference'),
    ).resolves.toBe(false);
  });
});
