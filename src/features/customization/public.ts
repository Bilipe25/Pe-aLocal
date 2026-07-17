import 'server-only';

import type { StoreCustomizationConfig } from '@/schemas/customization';

import { createCustomizationFromLegacy } from './domain/defaults';
import { migrateCustomizationToCurrentVersion } from './domain/migrations';

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
  try {
    const published = migrateCustomizationToCurrentVersion(input.publishedConfig);
    return {
      config: published,
      publishedVersion: input.publishedVersion ?? 0,
      publishedAt: input.publishedAt ?? null,
      source: 'published',
    };
  } catch {
    return {
      config: createCustomizationFromLegacy(input.legacy),
      publishedVersion: 0,
      publishedAt: null,
      source: 'legacy',
    };
  }
}
