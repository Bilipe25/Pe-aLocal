import { z } from 'zod';

// =============================================================================
// Schemas de Entrega
// =============================================================================

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(80),
  fee: z.coerce.number().min(0, 'Taxa não pode ser negativa.').default(0),
  minOrderValue: z.coerce.number().min(0).nullable().optional(),
  estimatedTime: z.string().max(30).optional().default(''),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateDeliveryZoneSchema = createDeliveryZoneSchema;

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
