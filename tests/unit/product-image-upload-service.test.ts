import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/server/errors';
import { uploadProductImageAsTenantMember } from '@/server/services/store-asset.service';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  findScopedStoreAsset: vi.fn(),
  getStoreAssetRuntime: vi.fn(),
  inspectStoreAssetFile: vi.fn(),
  buildStoreAssetObjectKey: vi.fn(),
  ensureStoreEntitlement: vi.fn(),
  lockStoreEntitlement: vi.fn(),
  bucketPut: vi.fn(),
  bucketDelete: vi.fn(),
  productFindFirst: vi.fn(),
  productUpdateMany: vi.fn(),
  productCount: vi.fn(),
  assetAggregate: vi.fn(),
  assetCreate: vi.fn(),
  assetUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdmin: vi.fn(),
  requireSuperAdminStoreAccess: vi.fn(),
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/repositories/store-asset.repository', () => ({
  assetSelect: { id: true, objectKey: true, assetType: true },
  findScopedStoreAsset: mocks.findScopedStoreAsset,
}));
vi.mock('@/server/storage/store-assets', () => ({
  getStoreAssetRuntime: mocks.getStoreAssetRuntime,
  inspectStoreAssetFile: mocks.inspectStoreAssetFile,
  buildStoreAssetObjectKey: mocks.buildStoreAssetObjectKey,
}));
vi.mock('@/server/repositories/store-entitlement.repository', () => ({
  ensureStoreEntitlement: mocks.ensureStoreEntitlement,
  lockStoreEntitlement: mocks.lockStoreEntitlement,
}));

const oldAsset = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  assetType: 'PRODUCT_IMAGE' as const,
  objectKey: 'old.webp',
  mimeType: 'image/webp',
  width: 800,
  height: 800,
  sizeBytes: 3,
  altText: 'Imagem antiga',
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  deletedAt: null,
};

const newAsset = {
  ...oldAsset,
  id: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
  objectKey: 'new.webp',
  altText: 'Imagem de X-Burger',
};

describe('upload atômico de imagem de produto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindFirst.mockResolvedValue({ id: 'product-1', imageAssetId: oldAsset.id });
    mocks.findScopedStoreAsset.mockResolvedValue(oldAsset);
    mocks.getStoreAssetRuntime.mockResolvedValue({
      bucket: { put: mocks.bucketPut, delete: mocks.bucketDelete },
      images: {},
    });
    mocks.bucketPut.mockResolvedValue({});
    mocks.bucketDelete.mockResolvedValue(undefined);
    mocks.inspectStoreAssetFile.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/webp',
      extension: 'webp',
      width: 800,
      height: 800,
      sizeBytes: 3,
    });
    mocks.buildStoreAssetObjectKey.mockReturnValue(newAsset.objectKey);
    mocks.lockStoreEntitlement.mockResolvedValue({
      maxAssetCount: 1,
      maxAssetStorageBytes: 3,
    });
    mocks.assetAggregate.mockResolvedValue({ _count: { id: 1 }, _sum: { sizeBytes: 3 } });
    mocks.assetCreate.mockResolvedValue(newAsset);
    mocks.productUpdateMany.mockResolvedValue({ count: 1 });
    mocks.productCount.mockResolvedValueOnce(1).mockResolvedValue(0);
    mocks.assetUpdateMany.mockResolvedValue({ count: 1 });

    const tx = {
      product: {
        updateMany: mocks.productUpdateMany,
        count: mocks.productCount,
      },
      storeAsset: {
        aggregate: mocks.assetAggregate,
        create: mocks.assetCreate,
        updateMany: mocks.assetUpdateMany,
      },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      product: { findFirst: mocks.productFindFirst, count: mocks.productCount },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
  });

  it('associa o novo asset, libera o anterior e permite substituição no limite da cota', async () => {
    const result = await uploadProductImageAsTenantMember({
      tenantId: 'tenant-1',
      storeId: 'store-1',
      productId: 'product-1',
      userId: 'user-1',
      file: new File(['webp'], 'produto.webp', { type: 'image/webp' }),
      altText: 'Imagem de X-Burger',
    });

    expect(result.asset.id).toBe(newAsset.id);
    expect(mocks.productUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          imageAssetId: oldAsset.id,
        }),
        data: expect.objectContaining({
          imageAssetId: newAsset.id,
          imageUrl: `/api/store-assets/${newAsset.id}?width=768`,
        }),
      }),
    );
    expect(mocks.assetUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: oldAsset.id, assetType: 'PRODUCT_IMAGE' }),
        data: expect.objectContaining({ status: 'DELETED' }),
      }),
    );
  });

  it('remove o objeto novo do R2 quando há conflito concorrente', async () => {
    mocks.productUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      uploadProductImageAsTenantMember({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        productId: 'product-1',
        userId: 'user-1',
        file: new File(['webp'], 'produto.webp', { type: 'image/webp' }),
        altText: 'Imagem de X-Burger',
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(mocks.bucketDelete).toHaveBeenCalledWith(newAsset.objectKey);
  });
});
