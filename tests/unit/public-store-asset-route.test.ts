import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPublicStoreAsset: vi.fn(),
  serveStoreAsset: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));
vi.mock('@/server/repositories/store-asset.repository', () => ({
  findPublicStoreAsset: mocks.findPublicStoreAsset,
}));
vi.mock('@/server/storage/store-asset-response', () => ({
  serveStoreAsset: mocks.serveStoreAsset,
}));

import { GET } from '@/app/api/store-assets/[assetId]/route';

describe('rota pública de StoreAsset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('responde 503 sem detalhes internos quando o runtime está indisponível', async () => {
    mocks.findPublicStoreAsset.mockResolvedValue({ id: 'asset-a' });
    mocks.serveStoreAsset.mockRejectedValue(new Error('R2 internal connection data'));

    const response = await GET(new Request('http://localhost/api/store-assets/asset-a'), {
      params: Promise.resolve({ assetId: 'asset-a' }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.text()).toBe('Imagem temporariamente indisponível.');
    expect(response.headers.get('x-store-asset-failure')).not.toContain('connection');
  });

  it('preserva 404 para um asset inexistente', async () => {
    mocks.findPublicStoreAsset.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/store-assets/missing'), {
      params: Promise.resolve({ assetId: 'missing' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.serveStoreAsset).not.toHaveBeenCalled();
  });
});
