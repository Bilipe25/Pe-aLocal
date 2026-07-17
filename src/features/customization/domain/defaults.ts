import {
  storeCustomizationConfigSchema,
  type StoreCustomizationConfig,
} from '@/schemas/customization';

export const DEFAULT_CUSTOMIZATION = {
  schemaVersion: 1,
  identity: {
    slogan: '',
    shortDescription: '',
    aboutText: '',
    logoAssetId: null,
    logoDarkAssetId: null,
    coverAssetId: null,
    faviconAssetId: null,
    socialImageAssetId: null,
  },
  palette: {
    primary: '#D9480F',
    secondary: '#241C15',
    accent: '#F59E0B',
    background: '#FFFDF9',
    surface: '#FFFFFF',
    text: '#241C15',
    mutedText: '#6B625A',
    border: '#DED7CE',
    buttonBackground: '#C2410C',
    buttonText: '#FFFFFF',
  },
  typography: {
    headingFontKey: 'bricolage',
    bodyFontKey: 'inter',
    baseSize: 'medium',
    headingWeight: 'bold',
    buttonStyle: 'solid',
    borderRadius: 'medium',
  },
  theme: {
    layoutTemplate: 'CLASSIC_LIST',
    visualPreset: 'CLASSIC',
  },
  layout: {
    showCover: true,
    showSlogan: true,
    showSearch: true,
    showFeaturedProducts: true,
    showCategoryDescription: false,
    showProductImages: true,
    showProductBadges: true,
    categoryNavigation: 'HORIZONTAL_STICKY',
    productPresentation: 'LIST',
    cartPresentation: 'FLOATING',
    sectionOrder: ['HEADER', 'BANNERS', 'FEATURED', 'CATEGORIES', 'CATALOG', 'STORE_INFO'],
  },
  seo: {
    title: '',
    description: '',
    canonicalUrl: null,
    indexable: true,
  },
  platformBranding: {
    showPedidoLocalBranding: true,
  },
} satisfies StoreCustomizationConfig;

export function createDefaultCustomization(): StoreCustomizationConfig {
  return storeCustomizationConfigSchema.parse(structuredClone(DEFAULT_CUSTOMIZATION));
}

export function createCustomizationFromLegacy(input: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  fontFamily?: string | null;
}): StoreCustomizationConfig {
  const config = createDefaultCustomization();
  const primary = input.primaryColor
    ? storeCustomizationConfigSchema.shape.palette.shape.primary.safeParse(input.primaryColor)
    : null;
  const secondary = input.secondaryColor
    ? storeCustomizationConfigSchema.shape.palette.shape.secondary.safeParse(input.secondaryColor)
    : null;

  if (primary?.success) {
    config.palette.primary = primary.data;
    config.palette.buttonBackground = primary.data;
  }
  if (secondary?.success) config.palette.secondary = secondary.data;

  const normalizedFont = input.fontFamily?.trim().toLowerCase();
  if (normalizedFont?.includes('bricolage')) {
    config.typography.headingFontKey = 'bricolage';
  } else if (normalizedFont?.includes('inter')) {
    config.typography.headingFontKey = 'inter';
    config.typography.bodyFontKey = 'inter';
  }

  return storeCustomizationConfigSchema.parse(config);
}
