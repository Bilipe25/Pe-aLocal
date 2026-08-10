import type { MetadataRoute } from 'next';

import type { StoreCustomizationConfig } from '@/schemas/customization';

export const PEDIDOLOCAL_PWA_COLORS = {
  background: '#FFFDF9',
  theme: '#D9480F',
} as const;

export const PEDIDOLOCAL_PWA_ICONS: NonNullable<MetadataRoute.Manifest['icons']> = [
  {
    src: '/pwa/pedidolocal-icon-v1-192.png',
    sizes: '192x192',
    type: 'image/png',
  },
  {
    src: '/pwa/pedidolocal-icon-v1-512.png',
    sizes: '512x512',
    type: 'image/png',
  },
  {
    src: '/pwa/pedidolocal-maskable-v1-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

export interface StorePwaIcon {
  src: string;
  sizes: string;
  type: string;
}

export interface StorePwaManifestInput {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  config: StoreCustomizationConfig;
  icon: StorePwaIcon | null;
}

function shortName(name: string): string {
  const normalized = name.trim() || 'PedidoLocal';
  return Array.from(normalized).slice(0, 30).join('');
}

export function buildGlobalManifest(): MetadataRoute.Manifest {
  return {
    name: 'PedidoLocal',
    short_name: 'PedidoLocal',
    description: 'Peça diretamente da sua loja favorita.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: PEDIDOLOCAL_PWA_COLORS.background,
    theme_color: PEDIDOLOCAL_PWA_COLORS.theme,
    lang: 'pt-BR',
    dir: 'ltr',
    icons: PEDIDOLOCAL_PWA_ICONS,
  };
}

export function buildStoreManifest(input: StorePwaManifestInput): MetadataRoute.Manifest {
  const encodedSlug = encodeURIComponent(input.slug);
  const startUrl = `/${encodedSlug}`;
  const description =
    input.config.identity.shortDescription.trim() ||
    input.description?.trim() ||
    `Peça online em ${input.name}.`;
  const icons = input.icon ? [input.icon, ...PEDIDOLOCAL_PWA_ICONS] : PEDIDOLOCAL_PWA_ICONS;

  return {
    name: input.name,
    short_name: shortName(input.name),
    description,
    id: `/pwa/store/${encodeURIComponent(input.id)}`,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: input.config.palette.background,
    theme_color: input.config.palette.primary,
    lang: 'pt-BR',
    dir: 'ltr',
    icons,
  };
}
