import { describe, expect, it } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import { assertCustomizationEntitlement } from '@/features/customization/entitlements';
import { storeBannerInputSchema } from '@/schemas/store-banner';
import { hostnameSchema } from '@/schemas/store-domain';
import { storeEntitlementInputSchema } from '@/schemas/store-entitlement';
import { ValidationError } from '@/server/errors';

const entitlement = {
  allowedLayoutTemplates: ['CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'],
  allowedVisualPresets: [
    'CLASSIC',
    'MODERN',
    'MINIMALIST',
    'BURGER',
    'PIZZA',
    'ACAI_DESSERT',
    'EXECUTIVE_RESTAURANT',
    'DARK_PREMIUM',
  ],
  advancedTypographyEnabled: true,
  platformBrandingRemovalEnabled: false,
};

describe('recursos white-label', () => {
  it('valida coerência, textos e período do banner', () => {
    const base = {
      assetId: null,
      title: 'Promoção do dia',
      subtitle: null,
      buttonText: null,
      destinationType: 'NONE' as const,
      destinationValue: null,
      startsAt: null,
      endsAt: null,
      isActive: false,
      priority: 10,
    };
    expect(storeBannerInputSchema.safeParse(base).success).toBe(true);
    expect(
      storeBannerInputSchema.safeParse({
        ...base,
        buttonText: 'Ver oferta',
      }).success,
    ).toBe(false);
    expect(
      storeBannerInputSchema.safeParse({
        ...base,
        title: '<script>',
      }).success,
    ).toBe(false);
    expect(
      storeBannerInputSchema.safeParse({
        ...base,
        startsAt: '2026-08-02T12:00:00-03:00',
        endsAt: '2026-08-01T12:00:00-03:00',
      }).success,
    ).toBe(false);
  });

  it('normaliza hostname e rejeita protocolo, caminho, porta e wildcard', () => {
    expect(hostnameSchema.parse(' Cardapio.Exemplo.COM.BR ')).toBe('cardapio.exemplo.com.br');
    for (const invalid of [
      'https://exemplo.com',
      'exemplo.com/cardapio',
      'exemplo.com:443',
      '*.exemplo.com',
    ]) {
      expect(hostnameSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('exige listas de layouts e presets válidas, únicas e não vazias', () => {
    const base = {
      maxAssetCount: 25,
      maxAssetStorageBytes: 50 * 1024 * 1024,
      maxBanners: 5,
      allowedLayoutTemplates: ['CLASSIC_LIST'],
      allowedVisualPresets: ['CLASSIC'],
      advancedTypographyEnabled: true,
      customDomainEnabled: false,
      platformBrandingRemovalEnabled: false,
      scheduledBannersEnabled: false,
    };
    expect(storeEntitlementInputSchema.safeParse(base).success).toBe(true);
    expect(
      storeEntitlementInputSchema.safeParse({
        ...base,
        allowedVisualPresets: ['CLASSIC', 'CLASSIC'],
      }).success,
    ).toBe(false);
  });

  it('bloqueia no servidor layout, tipografia e remoção da marca fora do entitlement', () => {
    const config = createDefaultCustomization();
    config.platformBranding.showPedidoLocalBranding = false;
    expect(() => assertCustomizationEntitlement(config, entitlement)).toThrow(ValidationError);

    config.platformBranding.showPedidoLocalBranding = true;
    config.theme.layoutTemplate = 'MODERN_GRID';
    expect(() =>
      assertCustomizationEntitlement(config, {
        ...entitlement,
        allowedLayoutTemplates: ['CLASSIC_LIST'],
      }),
    ).toThrow(ValidationError);

    config.theme.layoutTemplate = 'CLASSIC_LIST';
    config.typography.headingFontKey = 'inter';
    expect(() =>
      assertCustomizationEntitlement(config, {
        ...entitlement,
        advancedTypographyEnabled: false,
      }),
    ).toThrow(ValidationError);
  });
});
