import { z } from 'zod';

export const CUSTOMIZATION_SCHEMA_VERSION = 2 as const;
export const CUSTOMIZATION_MAX_BYTES = 64 * 1024;

export const LAYOUT_TEMPLATES = ['CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'] as const;
export const VISUAL_PRESETS = [
  'CLASSIC',
  'MODERN',
  'MINIMALIST',
  'BURGER',
  'PIZZA',
  'ACAI_DESSERT',
  'EXECUTIVE_RESTAURANT',
  'DARK_PREMIUM',
] as const;
export const FONT_KEYS = ['inter', 'bricolage'] as const;
export const STORE_SECTIONS = [
  'HEADER',
  'BANNERS',
  'FEATURED',
  'CATEGORIES',
  'CATALOG',
  'STORE_INFO',
] as const;

const noMarkup = (value: string) => !/[<>]/.test(value);
const safeText = (max: number) =>
  z.string().trim().max(max).refine(noMarkup, 'Não use HTML nos textos.');

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use uma cor hexadecimal no formato #RRGGBB.')
  .transform((value) => value.toUpperCase());

const assetIdSchema = z.uuid().nullable();
const canonicalUrlSchema = z
  .url('Informe uma URL canônica válida.')
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'A URL canônica deve usar HTTP ou HTTPS.',
  })
  .nullable();

const identitySchema = z
  .object({
    slogan: safeText(120),
    shortDescription: safeText(240),
    aboutText: safeText(2000),
    logoAssetId: assetIdSchema,
    logoDarkAssetId: assetIdSchema,
    coverAssetId: assetIdSchema,
    faviconAssetId: assetIdSchema,
    socialImageAssetId: assetIdSchema,
  })
  .strict();

const paletteSchema = z
  .object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema,
    background: hexColorSchema,
    surface: hexColorSchema,
    text: hexColorSchema,
    mutedText: hexColorSchema,
    border: hexColorSchema,
    buttonBackground: hexColorSchema,
    buttonText: hexColorSchema,
  })
  .strict();

const typographySchema = z
  .object({
    headingFontKey: z.enum(FONT_KEYS),
    bodyFontKey: z.enum(FONT_KEYS),
    baseSize: z.enum(['small', 'medium', 'large']),
    headingWeight: z.enum(['semibold', 'bold', 'extrabold']),
    buttonStyle: z.enum(['solid', 'outline']),
    borderRadius: z.enum(['none', 'small', 'medium', 'large', 'pill']),
  })
  .strict();

const themeSchema = z
  .object({
    layoutTemplate: z.enum(LAYOUT_TEMPLATES),
    visualPreset: z.enum(VISUAL_PRESETS),
  })
  .strict();

const layoutShape = {
  showCover: z.boolean(),
  showSlogan: z.boolean(),
  showSearch: z.boolean(),
  showFeaturedProducts: z.boolean(),
  showCategoryDescription: z.boolean(),
  showProductImages: z.boolean(),
  showProductBadges: z.boolean(),
  categoryNavigation: z.enum(['HORIZONTAL_STICKY', 'VERTICAL', 'DROPDOWN']),
  productPresentation: z.enum(['LIST', 'GRID']),
  cartPresentation: z.enum(['FLOATING', 'STICKY']),
  sectionOrder: z.array(z.enum(STORE_SECTIONS)).min(1).max(STORE_SECTIONS.length),
} as const;

function refineLayout(
  layout: { sectionOrder: readonly (typeof STORE_SECTIONS)[number][] },
  context: z.RefinementCtx,
) {
  if (new Set(layout.sectionOrder).size !== layout.sectionOrder.length) {
    context.addIssue({
      code: 'custom',
      path: ['sectionOrder'],
      message: 'A ordem das seções não pode conter itens repetidos.',
    });
  }
  if (!layout.sectionOrder.includes('CATALOG')) {
    context.addIssue({
      code: 'custom',
      path: ['sectionOrder'],
      message: 'A seção de catálogo é obrigatória.',
    });
  }
}

const layoutV1Schema = z.object(layoutShape).strict().superRefine(refineLayout);
const layoutV2Schema = z
  .object({ ...layoutShape, showCategoryImages: z.boolean() })
  .strict()
  .superRefine(refineLayout);

const seoSchema = z
  .object({
    title: safeText(70),
    description: safeText(160),
    canonicalUrl: canonicalUrlSchema,
    indexable: z.boolean(),
  })
  .strict();

const platformBrandingSchema = z
  .object({ showPedidoLocalBranding: z.boolean() })
  .strict();

const configShape = {
  identity: identitySchema,
  palette: paletteSchema,
  typography: typographySchema,
  theme: themeSchema,
  seo: seoSchema,
  platformBranding: platformBrandingSchema,
} as const;

function refineConfigSize(config: unknown, context: z.RefinementCtx) {
  const byteLength = new TextEncoder().encode(JSON.stringify(config)).byteLength;
  if (byteLength > CUSTOMIZATION_MAX_BYTES) {
    context.addIssue({
      code: 'custom',
      message: `A personalização não pode ultrapassar ${CUSTOMIZATION_MAX_BYTES} bytes.`,
    });
  }
}

export const categoryImageAssociationSchema = z
  .object({
    categoryId: z.uuid(),
    assetId: z.uuid(),
  })
  .strict();

const categoryImagesSchema = z
  .array(categoryImageAssociationSchema)
  .max(100, 'A personalização pode associar imagens a no máximo 100 categorias.')
  .superRefine((associations, context) => {
    const seenCategoryIds = new Set<string>();
    associations.forEach((association, index) => {
      if (seenCategoryIds.has(association.categoryId)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'categoryId'],
          message: 'Cada categoria pode possuir somente uma imagem associada.',
        });
      }
      seenCategoryIds.add(association.categoryId);
    });
  });

export const storeCustomizationConfigV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    ...configShape,
    layout: layoutV1Schema,
  })
  .strict()
  .superRefine(refineConfigSize);

export const storeCustomizationConfigV2Schema = z
  .object({
    schemaVersion: z.literal(CUSTOMIZATION_SCHEMA_VERSION),
    ...configShape,
    layout: layoutV2Schema,
    categoryImages: categoryImagesSchema,
  })
  .strict()
  .superRefine(refineConfigSize);

/** Schema corrente usado para todo novo draft e publicação. */
export const storeCustomizationConfigSchema = storeCustomizationConfigV2Schema;

export const customizationPublishSchema = z
  .object({
    expectedDraftVersion: z.coerce.number().int().nonnegative(),
    reason: safeText(500).pipe(z.string().min(3, 'Informe um motivo com pelo menos 3 caracteres.')),
  })
  .strict();

export const customizationVersionSchema = z
  .object({ expectedDraftVersion: z.coerce.number().int().nonnegative() })
  .strict();

export type StoreCustomizationConfig = z.infer<typeof storeCustomizationConfigSchema>;
export type StoreCustomizationConfigV1 = z.infer<typeof storeCustomizationConfigV1Schema>;
export type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number];
export type VisualPreset = (typeof VISUAL_PRESETS)[number];
export type StoreSection = (typeof STORE_SECTIONS)[number];
