import { describe, expect, it } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import { buildGlobalManifest, buildStoreManifest, PEDIDOLOCAL_PWA_ICONS } from '@/lib/pwa/manifest';

describe('manifests PWA', () => {
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
      icon: null,
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
      icon: {
        src: '/api/store-assets/icon-1',
        sizes: '512x512',
        type: 'image/png',
      },
    });

    expect(manifest.icons?.[0]).toMatchObject({ src: '/api/store-assets/icon-1' });
    expect(manifest.icons).toHaveLength(PEDIDOLOCAL_PWA_ICONS.length + 1);
  });
});
