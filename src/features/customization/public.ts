import 'server-only';

import type { StoreCustomizationConfig } from '@/schemas/customization';
import { storeCustomizationConfigSchema } from '@/schemas/customization';

import { createCustomizationFromLegacy } from './domain/defaults';

interface LegacyCustomizationInput {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  fontFamily?: string | null;
}

export interface PublicCustomization {
  config: StoreCustomizationConfig;
  publishedVersion: number;
  publishedAt: Date | null;
  source: 'published' | 'legacy';
}

/**
 * Resolve somente a configuração publicada. Dados de draft nunca entram
 * neste contrato e uma configuração antiga ou inválida cai no tema legado.
 */
export function resolvePublicCustomization(input: {
  publishedConfig?: unknown;
  publishedVersion?: number | null;
  publishedAt?: Date | null;
  legacy: LegacyCustomizationInput;
}): PublicCustomization {
  const published = storeCustomizationConfigSchema.safeParse(input.publishedConfig);

  if (published.success) {
    return {
      config: published.data,
      publishedVersion: input.publishedVersion ?? 0,
      publishedAt: input.publishedAt ?? null,
      source: 'published',
    };
  }

  return {
    config: createCustomizationFromLegacy(input.legacy),
    publishedVersion: 0,
    publishedAt: null,
    source: 'legacy',
  };
}
