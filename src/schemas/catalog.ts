import { z } from 'zod';
import { formBooleanSchema, formBooleanWithDefault } from '@/schemas/form-boolean';

// =============================================================================
// Schemas de Catálogo
// =============================================================================
// IMPORTANTE: Não usar z.coerce.boolean() — Boolean("false") === true (BUG).
// Usar formBooleanSchema ou formBooleanWithDefault para campos de FormData.
// =============================================================================

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(80, 'Nome deve ter no máximo 80 caracteres.')
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(300, 'Descrição deve ter no máximo 300 caracteres.')
    .optional()
    .default('')
    .transform((s) => s?.trim() ?? ''),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: formBooleanWithDefault(true),
});

export const updateCategorySchema = createCategorySchema;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductSchema = z.object({
  categoryId: z.string().uuid('Categoria inválida.'),
  name: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(120, 'Nome deve ter no máximo 120 caracteres.')
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(500, 'Descrição deve ter no máximo 500 caracteres.')
    .optional()
    .default('')
    .transform((s) => s?.trim() ?? ''),
  basePrice: z.coerce
    .number()
    .min(0, 'Preço não pode ser negativo.')
    .max(999999.99, 'Preço excede o limite máximo.'),
  isAvailable: formBooleanWithDefault(true),
  isFeatured: formBooleanWithDefault(false),
  allowNotes: formBooleanWithDefault(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const createOptionGroupSchema = z.object({
  productId: z.string().uuid('Produto inválido.'),
  title: z
    .string()
    .min(2, 'Título deve ter pelo menos 2 caracteres.')
    .max(80, 'Título deve ter no máximo 80 caracteres.')
    .transform((s) => s.trim()),
  description: z
    .string()
    .max(200, 'Descrição deve ter no máximo 200 caracteres.')
    .optional()
    .default('')
    .transform((s) => s?.trim() ?? ''),
  isRequired: formBooleanWithDefault(false),
  isMultiple: formBooleanWithDefault(false),
  minSelections: z.coerce.number().int().min(0, 'Mínimo deve ser >= 0.').default(0),
  maxSelections: z.coerce.number().int().min(1, 'Máximo deve ser >= 1.').default(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: formBooleanWithDefault(true),
});

export const updateOptionGroupSchema = createOptionGroupSchema.omit({ productId: true });

export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>;
export type UpdateOptionGroupInput = z.infer<typeof updateOptionGroupSchema>;

export const createOptionSchema = z.object({
  groupId: z.string().uuid('Grupo inválido.'),
  name: z
    .string()
    .min(1, 'Nome é obrigatório.')
    .max(80, 'Nome deve ter no máximo 80 caracteres.')
    .transform((s) => s.trim()),
  price: z.coerce
    .number()
    .min(0, 'Preço não pode ser negativo.')
    .max(999999.99, 'Preço excede o limite máximo.')
    .default(0),
  isAvailable: formBooleanWithDefault(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateOptionSchema = createOptionSchema.omit({ groupId: true });

export type CreateOptionInput = z.infer<typeof createOptionSchema>;
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;
