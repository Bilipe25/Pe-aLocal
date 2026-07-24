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
    '--store-primary-hover': `color-mix(in srgb, ${config.palette.primary} 88%, ${config.palette.text})`,
    '--store-primary-active': `color-mix(in srgb, ${config.palette.primary} 76%, ${config.palette.text})`,
    '--store-primary-foreground': config.palette.buttonText,
    '--store-secondary': config.palette.secondary,
    '--store-accent': config.palette.accent,
    '--store-background': config.palette.background,
    '--store-surface': config.palette.surface,
    '--store-surface-raised': config.palette.surface,
    '--store-surface-muted': `color-mix(in srgb, ${config.palette.surface} 82%, ${config.palette.background})`,
    '--store-text': config.palette.text,
    '--store-text-muted': config.palette.mutedText,
    '--store-muted-text': config.palette.mutedText,
    '--store-border': config.palette.border,
    '--store-success': '#3F7D58',
    '--store-warning': '#B86E00',
    '--store-danger': '#C33D3D',
    '--store-focus-ring': config.palette.primary,
    '--store-hero-overlay':
      'linear-gradient(180deg, rgb(0 0 0 / 0.12) 0%, rgb(0 0 0 / 0.3) 42%, rgb(0 0 0 / 0.82) 100%)',
    '--store-shadow-sm': `0 1px 2px color-mix(in srgb, ${config.palette.text} 10%, transparent)`,
    '--store-shadow-md': `0 4px 8px color-mix(in srgb, ${config.palette.text} 13%, transparent)`,
    '--store-shadow-lg': `0 10px 15px -3px color-mix(in srgb, ${config.palette.text} 16%, transparent)`,
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
