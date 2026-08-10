import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createDefaultCustomization } from '@/features/customization/domain';
import { buildGlobalManifest, buildStoreManifest, PEDIDOLOCAL_PWA_ICONS } from '@/lib/pwa/manifest';

describe('manifests PWA', () => {
  it('declara as dimensões físicas reais dos PNGs estáticos', () => {
    const icons = [
      ...PEDIDOLOCAL_PWA_ICONS,
      { src: '/pwa/apple-touch-icon-v1-180.png', sizes: '180x180' },
    ];
    for (const icon of icons) {
      const path = resolve(process.cwd(), 'public', icon.src.replace(/^\//, ''));
      const png = readFileSync(path);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });

  it('cria o manifest global instalável com identidade PedidoLocal', () => {
    const manifest = buildGlobalManifest();

    expect(manifest).toMatchObject({
      name: 'PedidoLocal',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#FFFDF9',
      theme_color: '#D9480F',
      lang: 'pt-BR',
    });
    expect(manifest.icons).toEqual(PEDIDOLOCAL_PWA_ICONS);
  });

  it('usa id estável da loja, slug navegável e cores publicadas', () => {
    const config = createDefaultCustomization();
    config.palette.primary = '#123456';
    config.palette.background = '#F0F0F0';
    config.identity.shortDescription = 'Feito hoje.';

    const manifest = buildStoreManifest({
      id: 'store-1',
      name: 'Padaria da Praça',
      slug: 'padaria-nova',
      description: 'Descrição antiga',
      config,
      iconAssetId: null,
    });

    expect(manifest).toMatchObject({
      id: '/pwa/store/store-1',
      start_url: '/padaria-nova',
      scope: '/padaria-nova',
      theme_color: '#123456',
      background_color: '#F0F0F0',
      description: 'Feito hoje.',
    });
  });

  it('prioriza o ícone white-label válido e conserva o fallback', () => {
    const manifest = buildStoreManifest({
      id: 'store-1',
      name: 'Loja',
      slug: 'loja',
      description: null,
      config: createDefaultCustomization(),
      iconAssetId: 'icon-1',
    });

    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: '/api/store-assets/icon-1?variant=pwa-any-192',
        sizes: '192x192',
      }),
      expect.objectContaining({
        src: '/api/store-assets/icon-1?variant=pwa-any-512',
        sizes: '512x512',
      }),
      expect.objectContaining({
        src: '/api/store-assets/icon-1?variant=pwa-maskable-512&background=%23FFFDF9',
        purpose: 'maskable',
      }),
    ]);
  });
});
