import { z } from 'zod';

// =============================================================================
// Schemas de Catálogo
// =============================================================================

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(80),
  description: z.string().max(300).optional().default(''),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createProductSchema = z.object({
  categoryId: z.string().uuid('Categoria inválida.'),
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(120),
  description: z.string().max(500).optional().default(''),
  basePrice: z.coerce.number().min(0, 'Preço não pode ser negativo.'),
  isAvailable: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
  allowNotes: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateProductSchema = createProductSchema;

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const createOptionGroupSchema = z.object({
  productId: z.string().uuid('Produto inválido.'),
  title: z.string().min(2, 'Título deve ter pelo menos 2 caracteres.').max(80),
  description: z.string().max(200).optional().default(''),
  isRequired: z.coerce.boolean().default(false),
  isMultiple: z.coerce.boolean().default(false),
  minSelections: z.coerce.number().int().min(0).default(0),
  maxSelections: z.coerce.number().int().min(1).default(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const updateOptionGroupSchema = createOptionGroupSchema.omit({ productId: true });

export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>;

export const createOptionSchema = z.object({
  groupId: z.string().uuid('Grupo inválido.'),
  name: z.string().min(1, 'Nome é obrigatório.').max(80),
  price: z.coerce.number().min(0, 'Preço não pode ser negativo.').default(0),
  isAvailable: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateOptionSchema = createOptionSchema.omit({ groupId: true });

export type CreateOptionInput = z.infer<typeof createOptionSchema>;
