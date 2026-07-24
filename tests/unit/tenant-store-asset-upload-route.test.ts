import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/tenant/assets/route';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  revalidateTag: vi.fn(),
  uploadProductImageAsTenantMember: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock('@/server/services/store-context.service', () => ({
  requireActiveStoreContext: mocks.requireActiveStoreContext,
}));

vi.mock('@/server/services/store-asset.service', () => ({
  uploadProductImageAsTenantMember: mocks.uploadProductImageAsTenantMember,
}));

describe('POST /api/tenant/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revalidateTag.mockReturnValue(undefined);
    mocks.requireActiveStoreContext.mockResolvedValue({
      session: {
        tenantId: '00000000-0000-0000-0000-000000000001',
        userId: '00000000-0000-4000-8000-000000000001',
      },
      store: { id: '7a053488-39a2-41d5-bb53-042a7347858b' },
    });
  });

  it('aceita o GUID determinístico de um produto da loja de demonstração', async () => {
    const productId = '00000000-0000-0000-0002-000000000003';
    const file = new File(['png'], 'produto.png', { type: 'image/png' });
    const asset = {
      id: '00875f40-bfde-4b62-8db0-d501c678650e',
      assetType: 'PRODUCT_IMAGE',
    };
    mocks.uploadProductImageAsTenantMember.mockResolvedValue({
      asset,
      replacedAssetId: null,
    });

    const request = new Request('http://localhost/api/tenant/assets', { method: 'POST' });
    vi.spyOn(request, 'formData').mockResolvedValue({
      get: (key: string) =>
        ({
          file,
          productId,
          altText: 'Imagem de X-Salada',
        })[key] ?? null,
    } as FormData);

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.uploadProductImageAsTenantMember).toHaveBeenCalledWith({
      tenantId: '00000000-0000-0000-0000-000000000001',
      storeId: '7a053488-39a2-41d5-bb53-042a7347858b',
      productId,
      userId: '00000000-0000-4000-8000-000000000001',
      file,
      altText: 'Imagem de X-Salada',
    });
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      'catalog:7a053488-39a2-41d5-bb53-042a7347858b',
      { expire: 0 },
    );
  });

  it('mantém resposta 201 quando somente a invalidação de cache falha após o commit', async () => {
    const productId = '00000000-0000-0000-0002-000000000006';
    const file = new File(['jpeg'], 'suco.jpg', { type: 'image/jpeg' });
    mocks.uploadProductImageAsTenantMember.mockResolvedValue({
      asset: {
        id: '770fbe80-7d60-47b7-95b3-d475e56deb4f',
        assetType: 'PRODUCT_IMAGE',
      },
      replacedAssetId: null,
    });
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error('cache indisponível');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const request = new Request('http://localhost/api/tenant/assets', { method: 'POST' });
    vi.spyOn(request, 'formData').mockResolvedValue({
      get: (key: string) =>
        ({
          file,
          productId,
          altText: 'Imagem de Suco Natural 500ml',
        })[key] ?? null,
    } as FormData);

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(consoleError).toHaveBeenCalledWith(
      '[ASSET_CACHE_REVALIDATION_ERROR]',
      expect.any(Error),
    );
  });
});
