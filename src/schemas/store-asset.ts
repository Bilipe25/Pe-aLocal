import { z } from 'zod';

export const STORE_ASSET_TYPES = [
  'LOGO',
  'LOGO_DARK',
  'COVER',
  'FAVICON',
  'SOCIAL_IMAGE',
  'BANNER',
  'CATEGORY_IMAGE',
  'PRODUCT_IMAGE',
] as const;

export const STORE_ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
] as const;

export const STORE_ASSET_MAX_BYTES: Record<(typeof STORE_ASSET_TYPES)[number], number> = {
  LOGO: 2 * 1024 * 1024,
  LOGO_DARK: 2 * 1024 * 1024,
  COVER: 5 * 1024 * 1024,
  FAVICON: 512 * 1024,
  SOCIAL_IMAGE: 3 * 1024 * 1024,
  BANNER: 5 * 1024 * 1024,
  CATEGORY_IMAGE: 2 * 1024 * 1024,
  PRODUCT_IMAGE: 3 * 1024 * 1024,
};

export const storeAssetUploadMetadataSchema = z
  .object({
    assetType: z.enum(STORE_ASSET_TYPES),
    altText: z
      .string()
      .trim()
      .max(300, 'O texto alternativo deve ter no máximo 300 caracteres.')
      .refine((value) => !/[<>]/.test(value), 'Não use HTML no texto alternativo.'),
    replaceAssetId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assetType !== 'FAVICON' && value.altText.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['altText'],
        message: 'Informe um texto alternativo para esta imagem.',
      });
    }
  });

export const storeAssetDeleteSchema = z
  .object({
    tenantId: z.uuid(),
    storeId: z.uuid(),
    assetId: z.uuid(),
  })
  .strict();

export type StoreAssetUploadMetadata = z.infer<typeof storeAssetUploadMetadataSchema>;
export type StoreAssetTypeValue = (typeof STORE_ASSET_TYPES)[number];
export type StoreAssetMimeType = (typeof STORE_ASSET_MIME_TYPES)[number];
