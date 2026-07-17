import type { CSSProperties } from 'react';

import type { StoreCustomizationConfig } from '@/schemas/customization';

type StorefrontStyle = CSSProperties & Record<`--store-${string}`, string>;

const FONT_FAMILIES = {
  inter: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif',
  bricolage: 'var(--font-bricolage), ui-serif, Georgia, serif',
} as const;

const BASE_SIZES = {
  small: '14px',
  medium: '16px',
  large: '18px',
} as const;

const HEADING_WEIGHTS = {
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

const RADII = {
  none: '0px',
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
  pill: '9999px',
} as const;

export function getStorefrontThemeStyle(config: StoreCustomizationConfig): StorefrontStyle {
  return {
    '--store-primary': config.palette.primary,
    '--store-secondary': config.palette.secondary,
    '--store-accent': config.palette.accent,
    '--store-background': config.palette.background,
    '--store-surface': config.palette.surface,
    '--store-text': config.palette.text,
    '--store-muted-text': config.palette.mutedText,
    '--store-border': config.palette.border,
    '--store-button-background': config.palette.buttonBackground,
    '--store-button-text': config.palette.buttonText,
    '--store-heading-font': FONT_FAMILIES[config.typography.headingFontKey],
    '--store-body-font': FONT_FAMILIES[config.typography.bodyFontKey],
    '--store-base-size': BASE_SIZES[config.typography.baseSize],
    '--store-heading-weight': HEADING_WEIGHTS[config.typography.headingWeight],
    '--store-radius': RADII[config.typography.borderRadius],
  };
}

export function storefrontLayoutClass(config: StoreCustomizationConfig): string {
  return `storefront-layout-${config.theme.layoutTemplate.toLowerCase().replaceAll('_', '-')}`;
}
