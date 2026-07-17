import { Blob as NodeBlob } from 'node:buffer';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { ValidationError } from '@/server/errors';
import {
  buildStoreAssetObjectKey,
  detectImageMimeType,
  inspectStoreAssetFile,
  type StoreAssetRuntime,
} from '@/server/storage/store-assets';

function runtimeWithInfo(width: number, height: number) {
  return {
    bucket: {},
    images: {
      info: vi.fn().mockResolvedValue({ format: 'image/png', width, height }),
    },
  } as unknown as StoreAssetRuntime;
}

describe('domínio de assets da loja', () => {
  beforeAll(() => vi.stubGlobal('Blob', NodeBlob));
  afterAll(() => vi.unstubAllGlobals());

  it('detecta o MIME pela assinatura e não confia apenas no declarado', () => {
    expect(
      detectImageMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectImageMimeType(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
  });

  it('rejeita arquivo cuja assinatura difere do MIME declarado', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'imagem.png', {
      type: 'image/png',
    });

    await expect(
      inspectStoreAssetFile(file, 'LOGO', runtimeWithInfo(256, 256)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('valida dimensões decodificadas pelo binding Images', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const file = new File([png], 'capa.png', { type: 'image/png' });

    await expect(
      inspectStoreAssetFile(file, 'COVER', runtimeWithInfo(200, 200)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      inspectStoreAssetFile(file, 'COVER', runtimeWithInfo(1200, 600)),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      width: 1200,
      height: 600,
      extension: 'png',
    });
  });

  it('exige texto alternativo fora do favicon e bloqueia HTML', () => {
    expect(
      storeAssetUploadMetadataSchema.safeParse({ assetType: 'LOGO', altText: '' }).success,
    ).toBe(false);
    expect(
      storeAssetUploadMetadataSchema.safeParse({ assetType: 'FAVICON', altText: '' }).success,
    ).toBe(true);
    expect(
      storeAssetUploadMetadataSchema.safeParse({ assetType: 'COVER', altText: '<img>' }).success,
    ).toBe(false);
  });

  it('gera uma chave imutável e escopada por tenant e loja', () => {
    expect(
      buildStoreAssetObjectKey({
        tenantId: 'tenant-1',
        storeId: 'store-2',
        assetType: 'SOCIAL_IMAGE',
        assetId: 'asset-3',
        extension: 'webp',
      }),
    ).toBe('tenants/tenant-1/stores/store-2/social_image/asset-3.webp');
  });
});
