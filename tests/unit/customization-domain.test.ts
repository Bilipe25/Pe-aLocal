import { describe, expect, it } from 'vitest';

import {
  applyVisualPreset,
  contrastRatio,
  createCustomizationFromLegacy,
  createDefaultCustomization,
  CUSTOMIZATION_PRESETS,
  evaluateCustomizationContrast,
} from '@/features/customization/domain';
import { storeCustomizationConfigSchema, VISUAL_PRESETS } from '@/schemas/customization';

describe('domínio de personalização', () => {
  it('gera um default válido e sem referência mutável compartilhada', () => {
    const first = createDefaultCustomization();
    const second = createDefaultCustomization();
    first.identity.slogan = 'Alterado';

    expect(storeCustomizationConfigSchema.safeParse(second).success).toBe(true);
    expect(second.identity.slogan).toBe('');
  });

  it('rejeita propriedades desconhecidas, HTML, cores alfa e catálogo ausente', () => {
    const config = createDefaultCustomization() as Record<string, unknown>;
    config.unknown = true;
    expect(storeCustomizationConfigSchema.safeParse(config).success).toBe(false);

    const markup = createDefaultCustomization();
    markup.identity.slogan = '<strong>promoção</strong>';
    expect(storeCustomizationConfigSchema.safeParse(markup).success).toBe(false);

    const alpha = createDefaultCustomization();
    alpha.palette.primary = '#FFFFFF80';
    expect(storeCustomizationConfigSchema.safeParse(alpha).success).toBe(false);

    const noCatalog = createDefaultCustomization();
    noCatalog.layout.sectionOrder = ['HEADER'];
    expect(storeCustomizationConfigSchema.safeParse(noCatalog).success).toBe(false);
  });

  it('normaliza cores e preserva valores legados válidos', () => {
    const config = createCustomizationFromLegacy({
      primaryColor: '#abcdef',
      secondaryColor: '#123456',
      fontFamily: 'Inter',
    });

    expect(config.palette.primary).toBe('#ABCDEF');
    expect(config.palette.secondary).toBe('#123456');
    expect(config.typography).toMatchObject({ headingFontKey: 'inter', bodyFontKey: 'inter' });
  });

  it('usa defaults quando os valores legados são inválidos', () => {
    const config = createCustomizationFromLegacy({
      primaryColor: 'javascript:alert(1)',
      secondaryColor: '#fff',
      fontFamily: 'https://fontes.example/fonte.woff',
    });

    expect(config).toEqual(createDefaultCustomization());
  });

  it('calcula contraste e sinaliza combinações críticas', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    const config = createDefaultCustomization();
    config.palette.text = '#FFFFFF';
    config.palette.background = '#FFFFFF';

    expect(evaluateCustomizationContrast(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pair: 'Texto sobre fundo', severity: 'error', ratio: 1 }),
      ]),
    );
  });

  it('bloqueia texto secundário e ações outline sem contraste suficiente', () => {
    const config = createDefaultCustomization();
    config.palette.mutedText = config.palette.background;
    config.palette.buttonBackground = config.palette.surface;

    const criticalPairs = evaluateCustomizationContrast(config)
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.pair);

    expect(criticalPairs).toEqual(
      expect.arrayContaining([
        'Texto secundário sobre fundo',
        'Ação outline sobre cartão',
      ]),
    );
  });

  it.each(VISUAL_PRESETS)('mantém o preset %s válido e sem contraste crítico', (preset) => {
    const config = applyVisualPreset(createDefaultCustomization(), preset, true);

    expect(CUSTOMIZATION_PRESETS[preset]).toBeDefined();
    expect(storeCustomizationConfigSchema.safeParse(config).success).toBe(true);
    expect(
      evaluateCustomizationContrast(config).filter((issue) => issue.severity === 'error'),
    ).toEqual([]);
  });

  it('preserva identidade, SEO e paleta quando a substituição de cores não é confirmada', () => {
    const current = createDefaultCustomization();
    current.identity.slogan = 'Sabor da casa';
    current.seo.title = 'Loja especial';
    current.palette.primary = '#123456';

    const result = applyVisualPreset(current, 'MODERN', false);

    expect(result.identity.slogan).toBe('Sabor da casa');
    expect(result.seo.title).toBe('Loja especial');
    expect(result.palette.primary).toBe('#123456');
    expect(result.theme.visualPreset).toBe('MODERN');
  });
});
