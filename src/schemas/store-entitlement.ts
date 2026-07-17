import { z } from 'zod';

import { LAYOUT_TEMPLATES, VISUAL_PRESETS } from '@/schemas/customization';

export const storeEntitlementInputSchema = z
  .object({
    maxAssetCount: z.coerce.number().int().min(1).max(1000),
    maxAssetStorageBytes: z.coerce
      .number()
      .int()
      .min(1024 * 1024)
      .max(1024 * 1024 * 1024),
    maxBanners: z.coerce.number().int().min(0).max(100),
    allowedLayoutTemplates: z
      .array(z.enum(LAYOUT_TEMPLATES))
      .min(1)
      .max(LAYOUT_TEMPLATES.length)
      .refine((values) => new Set(values).size === values.length),
    allowedVisualPresets: z
      .array(z.enum(VISUAL_PRESETS))
      .min(1)
      .max(VISUAL_PRESETS.length)
      .refine((values) => new Set(values).size === values.length),
    advancedTypographyEnabled: z.boolean(),
    customDomainEnabled: z.boolean(),
    platformBrandingRemovalEnabled: z.boolean(),
    scheduledBannersEnabled: z.boolean(),
  })
  .strict();

export type StoreEntitlementInput = z.input<typeof storeEntitlementInputSchema>;
export type ParsedStoreEntitlementInput = z.output<typeof storeEntitlementInputSchema>;
