import { describe, expect, it } from 'vitest';

import { createDefaultCustomization, CUSTOMIZATION_PRESETS } from '@/features/customization/domain';
import { resolvePublicCustomization } from '@/features/customization/public';
import { getStorefrontThemeStyle, storefrontLayoutClass } from '@/features/customization/theme';

describe('personalização pública', () => {
  it('usa somente uma configuração publicada válida', () => {
    const published = createDefaultCustomization();
    published.identity.slogan = 'Publicado';

    const result = resolvePublicCustomization({
      publishedConfig: published,
      publishedVersion: 4,
      publishedAt: new Date('2026-07-17T15:00:00Z'),
      legacy: { primaryColor: '#000000' },
    });

    expect(result.source).toBe('published');
    expect(result.publishedVersion).toBe(4);
    expect(result.config.identity.slogan).toBe('Publicado');
  });

  it('cai no tema legado seguro quando a publicação está ausente ou inválida', () => {
    const result = resolvePublicCustomization({
      publishedConfig: { schemaVersion: 999, draftOnly: true },
      publishedVersion: 10,
      legacy: {
        primaryColor: '#123456',
        secondaryColor: '#654321',
        fontFamily: 'Inter',
      },
    });

    expect(result.source).toBe('legacy');
    expect(result.publishedVersion).toBe(0);
    expect(result.config.palette.primary).toBe('#123456');
    expect(result.config.palette.secondary).toBe('#654321');
  });

  it('transforma os oito presets em tokens SSR e cobre os três layouts', () => {
    const layouts = new Set<string>();

    for (const preset of Object.values(CUSTOMIZATION_PRESETS)) {
      const config = createDefaultCustomization();
      config.palette = structuredClone(preset.palette);
      config.typography = structuredClone(preset.typography);
      config.theme = structuredClone(preset.theme);
      config.layout.productPresentation = preset.productPresentation;

      const style = getStorefrontThemeStyle(config);
      expect(style['--store-primary']).toBe(preset.palette.primary);
      expect(style['--store-button-background']).toBe(preset.palette.buttonBackground);
      layouts.add(storefrontLayoutClass(config));
    }

    expect(Object.keys(CUSTOMIZATION_PRESETS)).toHaveLength(8);
    expect(layouts).toEqual(
      new Set([
        'storefront-layout-classic-list',
        'storefront-layout-modern-grid',
        'storefront-layout-editorial-hero',
      ]),
    );
  });
});
