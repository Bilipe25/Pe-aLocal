import { z } from 'zod';

import {
  storeCustomizationConfigV1Schema,
  storeCustomizationConfigV2Schema,
  type StoreCustomizationConfig,
} from '@/schemas/customization';

const customizationVersionProbeSchema = z
  .object({ schemaVersion: z.union([z.literal(1), z.literal(2)]) })
  .passthrough();

/**
 * Converte configurações persistidas para a versão corrente sem alterar o
 * objeto recebido. Revisões históricas continuam armazenadas em sua versão
 * original e só são migradas quando passam a ser usadas novamente.
 */
export function migrateCustomizationToCurrentVersion(value: unknown): StoreCustomizationConfig {
  const version = customizationVersionProbeSchema.parse(value).schemaVersion;

  if (version === 2) return storeCustomizationConfigV2Schema.parse(value);

  const legacy = storeCustomizationConfigV1Schema.parse(value);
  return storeCustomizationConfigV2Schema.parse({
    ...structuredClone(legacy),
    schemaVersion: 2,
    layout: {
      ...structuredClone(legacy.layout),
      showCategoryImages: false,
    },
    categoryImages: [],
  });
}
