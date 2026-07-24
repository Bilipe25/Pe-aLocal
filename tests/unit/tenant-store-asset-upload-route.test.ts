import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/tenant/assets/route';

const mocks = vi.hoisted(() => ({
  requireActiveStoreContext: vi.fn(),
  updateTag: vi.fn(),
  uploadProductImageAsTenantMember: vi.fn(),
}));

vi.mock('next/cache', () => ({
  updateTag: mocks.updateTag,
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
  });
});
