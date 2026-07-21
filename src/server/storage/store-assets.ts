import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import {
  STORE_ASSET_MAX_BYTES,
  STORE_ASSET_MIME_TYPES,
  type StoreAssetMimeType,
  type StoreAssetTypeValue,
} from '@/schemas/store-asset';
import { ValidationError } from '@/server/errors';

export interface StoreAssetInspection {
  buffer: ArrayBuffer;
  mimeType: StoreAssetMimeType;
  extension: 'png' | 'jpg' | 'webp' | 'avif';
  width: number;
  height: number;
  sizeBytes: number;
}

export interface StoreAssetRuntime {
  bucket: R2Bucket;
  images: ImagesBinding;
}

const MIME_EXTENSIONS: Record<StoreAssetMimeType, StoreAssetInspection['extension']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function bytesEqual(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function detectImageMimeType(bytes: Uint8Array): StoreAssetMimeType | null {
  if (bytes.length >= 8 && bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytesEqual(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytesEqual(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    bytesEqual(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 12 && bytesEqual(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

function assertDimensions(type: StoreAssetTypeValue, width: number, height: number) {
  if (width < 1 || height < 1 || width > 8000 || height > 8000) {
    throw new ValidationError('As dimensões da imagem não são permitidas.');
  }

  const ratio = width / height;
  const valid =
    type === 'FAVICON'
      ? width >= 16 && height >= 16 && ratio >= 0.8 && ratio <= 1.25
      : type === 'CATEGORY_IMAGE'
        ? width >= 320 && height >= 320 && ratio >= 0.8 && ratio <= 1.25
        : type === 'PRODUCT_IMAGE'
          ? width >= 200 && height >= 200 && ratio >= 0.5 && ratio <= 2.0
          : type === 'COVER' || type === 'BANNER'
            ? width >= 600 && height >= 180 && ratio >= 1.2 && ratio <= 5
            : type === 'SOCIAL_IMAGE'
              ? width >= 300 && height >= 200 && ratio >= 0.8 && ratio <= 2.2
              : width >= 32 && height >= 32 && ratio >= 0.2 && ratio <= 5;

  if (!valid) {
    throw new ValidationError('A proporção ou resolução não é adequada para este tipo de asset.', [
      { assetType: type, width, height },
    ]);
  }
}

export async function getStoreAssetRuntime(): Promise<StoreAssetRuntime> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.STORE_ASSETS_R2) throw new Error('Binding STORE_ASSETS_R2 indisponível.');
  if (!env.IMAGES) throw new Error('Binding IMAGES indisponível.');
  return { bucket: env.STORE_ASSETS_R2, images: env.IMAGES };
}

export async function inspectStoreAssetFile(
  file: File,
  assetType: StoreAssetTypeValue,
  runtime: StoreAssetRuntime,
): Promise<StoreAssetInspection> {
  const maxBytes = STORE_ASSET_MAX_BYTES[assetType];
  if (file.size < 1 || file.size > maxBytes) {
    throw new ValidationError(
      `O arquivo deve ter no máximo ${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB.`,
    );
  }
  if (!STORE_ASSET_MIME_TYPES.includes(file.type as StoreAssetMimeType)) {
    throw new ValidationError('Use uma imagem PNG, JPEG, WebP ou AVIF.');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength !== file.size || buffer.byteLength > maxBytes) {
    throw new ValidationError('O tamanho real do arquivo não corresponde ao upload informado.');
  }

  const detectedMime = detectImageMimeType(new Uint8Array(buffer));
  if (!detectedMime || detectedMime !== file.type) {
    throw new ValidationError(
      'A assinatura real do arquivo não corresponde ao tipo MIME declarado.',
    );
  }

  let info: ImageInfoResponse;
  try {
    info = await runtime.images.info(new Blob([buffer], { type: detectedMime }).stream());
  } catch {
    throw new ValidationError('A imagem está corrompida ou não pôde ser decodificada.');
  }
  if (!('width' in info) || !('height' in info) || info.format === 'image/svg+xml') {
    throw new ValidationError('O formato da imagem não é permitido.');
  }

  assertDimensions(assetType, info.width, info.height);
  return {
    buffer,
    mimeType: detectedMime,
    extension: MIME_EXTENSIONS[detectedMime],
    width: info.width,
    height: info.height,
    sizeBytes: buffer.byteLength,
  };
}

export function buildStoreAssetObjectKey(input: {
  tenantId: string;
  storeId: string;
  assetType: StoreAssetTypeValue;
  assetId: string;
  extension: StoreAssetInspection['extension'];
}) {
  return `tenants/${input.tenantId}/stores/${input.storeId}/${input.assetType.toLowerCase()}/${input.assetId}.${input.extension}`;
}
