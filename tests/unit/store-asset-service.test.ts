import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '@/server/errors';
import { deleteStoreAsset, uploadStoreAsset } from '@/server/services/store-asset.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdminStoreAccess: vi.fn(),
  getDb: vi.fn(),
  findScopedStoreAsset: vi.fn(),
  isStoreAssetReferenced: vi.fn(),
  getStoreAssetRuntime: vi.fn(),
  inspectStoreAssetFile: vi.fn(),
  buildStoreAssetObjectKey: vi.fn(),
  bucketPut: vi.fn(),
  bucketDelete: vi.fn(),
  assetCreate: vi.fn(),
  assetUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdmin: vi.fn(),
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));
vi.mock('@/server/repositories/store-asset.repository', () => ({
  assetSelect: { id: true },
  findScopedStoreAsset: mocks.findScopedStoreAsset,
  isStoreAssetReferenced: mocks.isStoreAssetReferenced,
}));
vi.mock('@/server/storage/store-assets', () => ({
  getStoreAssetRuntime: mocks.getStoreAssetRuntime,
  inspectStoreAssetFile: mocks.inspectStoreAssetFile,
  buildStoreAssetObjectKey: mocks.buildStoreAssetObjectKey,
}));

const activeAsset = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  assetType: 'LOGO' as const,
  objectKey: 'tenant/object.png',
  mimeType: 'image/png',
  width: 256,
  height: 256,
  sizeBytes: 8,
  altText: 'Logo',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-07-17T12:00:00Z'),
  deletedAt: null,
};

describe('StoreAssetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue({ session: { userId: 'admin-1' } });
    mocks.getStoreAssetRuntime.mockResolvedValue({
      bucket: { put: mocks.bucketPut, delete: mocks.bucketDelete },
      images: {},
    });
    mocks.bucketPut.mockResolvedValue({});
    mocks.bucketDelete.mockResolvedValue(undefined);
    mocks.inspectStoreAssetFile.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'image/png',
      extension: 'png',
      width: 256,
      height: 256,
      sizeBytes: 3,
    });
    mocks.buildStoreAssetObjectKey.mockReturnValue('tenants/tenant-1/stores/store-1/logo/new.png');
    mocks.assetCreate.mockResolvedValue(activeAsset);
    mocks.assetUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
    const tx = {
      storeAsset: { create: mocks.assetCreate, updateMany: mocks.assetUpdateMany },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    });
    mocks.findScopedStoreAsset.mockResolvedValue(activeAsset);
    mocks.isStoreAssetReferenced.mockResolvedValue(false);
  });

  it('grava no R2 com chave escopada e gera auditoria na mesma transação do registro', async () => {
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    await expect(
      uploadStoreAsset('tenant-1', 'store-1', file, { assetType: 'LOGO', altText: 'Logo' }),
    ).resolves.toMatchObject({ id: activeAsset.id, url: `/api/store-assets/${activeAsset.id}` });

    expect(mocks.buildStoreAssetObjectKey).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', storeId: 'store-1', assetType: 'LOGO' }),
    );
    expect(mocks.bucketPut).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        action: 'ASSET_UPLOADED',
      }),
    });
  });

  it('remove o objeto recém-enviado se a transação do banco falhar', async () => {
    const databaseError = new Error('database unavailable');
    mocks.assetCreate.mockRejectedValue(databaseError);

    await expect(
      uploadStoreAsset('tenant-1', 'store-1', new File(['png'], 'logo.png'), {
        assetType: 'LOGO',
        altText: 'Logo',
      }),
    ).rejects.toBe(databaseError);

    expect(mocks.bucketDelete).toHaveBeenCalledWith('tenants/tenant-1/stores/store-1/logo/new.png');
  });

  it('não permite substituir um asset ausente no escopo tenant/store', async () => {
    mocks.findScopedStoreAsset.mockResolvedValue(null);

    await expect(
      uploadStoreAsset('tenant-1', 'store-1', new File(['png'], 'logo.png'), {
        assetType: 'LOGO',
        altText: 'Logo',
        replaceAssetId: activeAsset.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mocks.getStoreAssetRuntime).not.toHaveBeenCalled();
    expect(mocks.bucketPut).not.toHaveBeenCalled();
  });

  it('impede a exclusão enquanto publicado, draft ou histórico referencia o asset', async () => {
    mocks.isStoreAssetReferenced.mockResolvedValue(true);

    await expect(deleteStoreAsset('tenant-1', 'store-1', activeAsset.id)).rejects.toBeInstanceOf(
      ConflictError,
    );

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.bucketDelete).not.toHaveBeenCalled();
  });

  it('faz soft delete auditado sem apagar imediatamente o objeto do R2', async () => {
    await deleteStoreAsset('tenant-1', 'store-1', activeAsset.id);

    expect(mocks.assetUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: activeAsset.id,
        tenantId: 'tenant-1',
        storeId: 'store-1',
        status: 'ACTIVE',
      }),
      data: expect.objectContaining({ status: 'DELETED' }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ASSET_DELETED', entityId: activeAsset.id }),
    });
    expect(mocks.bucketDelete).not.toHaveBeenCalled();
  });
});
