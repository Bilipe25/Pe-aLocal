import { Blob as NodeBlob } from 'node:buffer';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { STORE_ASSET_MAX_BYTES, storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { ValidationError } from '@/server/errors';
import { inspectStoreAssetFile, type StoreAssetRuntime } from '@/server/storage/store-assets';

function runtimeWithInfo(width: number, height: number) {
  return {
    bucket: {},
    images: {
      info: vi.fn().mockResolvedValue({ format: 'image/png', width, height }),
    },
  } as unknown as StoreAssetRuntime;
}

describe('asset de imagem de categoria', () => {
  beforeAll(() => vi.stubGlobal('Blob', NodeBlob));
  afterAll(() => vi.unstubAllGlobals());

  it('aplica limite de 2 MB e dimensões aproximadamente quadradas', async () => {
    expect(STORE_ASSET_MAX_BYTES.CATEGORY_IMAGE).toBe(2 * 1024 * 1024);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([png], 'categoria.png', { type: 'image/png' });

    await expect(
      inspectStoreAssetFile(file, 'CATEGORY_IMAGE', runtimeWithInfo(319, 320)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      inspectStoreAssetFile(file, 'CATEGORY_IMAGE', runtimeWithInfo(800, 400)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      inspectStoreAssetFile(file, 'CATEGORY_IMAGE', runtimeWithInfo(800, 800)),
    ).resolves.toMatchObject({ width: 800, height: 800 });
  });

  it('exige texto alternativo seguro', () => {
    expect(
      storeAssetUploadMetadataSchema.safeParse({ assetType: 'CATEGORY_IMAGE', altText: '' })
        .success,
    ).toBe(false);
    expect(
      storeAssetUploadMetadataSchema.safeParse({
        assetType: 'CATEGORY_IMAGE',
        altText: 'Hambúrguer artesanal representando a categoria Hambúrgueres',
      }).success,
    ).toBe(true);
    expect(
      storeAssetUploadMetadataSchema.safeParse({
        assetType: 'CATEGORY_IMAGE',
        altText: '<strong>Categoria</strong>',
      }).success,
    ).toBe(false);
  });
});
