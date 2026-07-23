import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/tenant/assets/[assetId]/route';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  findScopedStoreAsset: vi.fn(),
  serveStoreAsset: vi.fn(),
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));
vi.mock('@/server/repositories/store-asset.repository', () => ({
  findScopedStoreAsset: mocks.findScopedStoreAsset,
}));
vi.mock('@/server/storage/store-asset-response', () => ({
  serveStoreAsset: mocks.serveStoreAsset,
}));

const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';

describe('GET /api/tenant/assets/:assetId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActiveStoreContext.mockResolvedValue({
      session: { tenantId: 'tenant-1' },
      store: { id: 'store-1', isActive: false },
    });
    mocks.serveStoreAsset.mockResolvedValue(new Response('image', { status: 200 }));
  });

  it('entrega preview privado de PRODUCT_IMAGE mesmo quando a loja ainda está inativa', async () => {
    const asset = {
      id: assetId,
      tenantId: 'tenant-1',
      storeId: 'store-1',
      assetType: 'PRODUCT_IMAGE',
      status: 'ACTIVE',
      deletedAt: null,
      objectKey: 'image.webp',
      mimeType: 'image/webp',
      width: 800,
      height: 800,
    };
    mocks.findScopedStoreAsset.mockResolvedValue(asset);

    const response = await GET(new Request(`http://localhost/api/tenant/assets/${assetId}`), {
      params: Promise.resolve({ assetId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.findScopedStoreAsset).toHaveBeenCalledWith('tenant-1', 'store-1', assetId);
    expect(mocks.serveStoreAsset).toHaveBeenCalledWith(
      expect.any(Request),
      asset,
      'private, max-age=86400, immutable',
    );
  });

  it('não entrega asset ausente, removido ou fora do escopo da loja', async () => {
    mocks.findScopedStoreAsset.mockResolvedValue(null);

    const response = await GET(new Request(`http://localhost/api/tenant/assets/${assetId}`), {
      params: Promise.resolve({ assetId }),
    });

    expect(response.status).toBe(404);
    expect(mocks.serveStoreAsset).not.toHaveBeenCalled();
  });
});
