import { z } from 'zod';
import { formBooleanWithDefault } from '@/schemas/form-boolean';

// =============================================================================
// Schemas de Catálogo
// =============================================================================
// IMPORTANTE: Não usar z.coerce.boolean() — Boolean("false") === true (BUG).
// Usar formBooleanSchema ou formBooleanWithDefault para campos de FormData.
// =============================================================================

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(80, 'Nome deve ter no máximo 80 caracteres.'),
  description: z
    .string()
    .trim()
    .max(300, 'Descrição deve ter no máximo 300 caracteres.')
    .optional()
    .default(''),
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
    .trim()
    .min(2, 'Nome deve ter pelo menos 2 caracteres.')
    .max(120, 'Nome deve ter no máximo 120 caracteres.'),
  description: z
    .string()
    .trim()
    .max(500, 'Descrição deve ter no máximo 500 caracteres.')
    .optional()
    .default(''),
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

export const productAvailabilitySchema = z
  .object({
    isAvailable: z.boolean().optional(),
    isSoldOut: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.isAvailable !== undefined || value.isSoldOut !== undefined, {
    message: 'Informe o estado de disponibilidade que deve ser alterado.',
  });

export const catalogMoveDirectionSchema = z.enum(['up', 'down']);

export const catalogOrderedIdsSchema = z
  .array(z.uuid('Identificador de catálogo inválido.'))
  .min(1)
  .max(500, 'Não é possível reordenar mais de 500 itens por operação.')
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'A lista de ordenação contém itens repetidos.',
  });

const optionGroupSchema = z.object({
  productId: z.string().uuid('Produto inválido.'),
  title: z
    .string()
    .trim()
    .min(2, 'Título deve ter pelo menos 2 caracteres.')
    .max(80, 'Título deve ter no máximo 80 caracteres.'),
  description: z
    .string()
    .trim()
    .max(200, 'Descrição deve ter no máximo 200 caracteres.')
    .optional()
    .default(''),
  isRequired: formBooleanWithDefault(false),
  isMultiple: formBooleanWithDefault(false),
  minSelections: z.coerce.number().int().min(0, 'Mínimo deve ser >= 0.').default(0),
  maxSelections: z.coerce.number().int().min(1, 'Máximo deve ser >= 1.').default(1),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: formBooleanWithDefault(true),
});

function validateOptionGroupSelections(
  value: {
    isRequired: boolean;
    isMultiple: boolean;
    minSelections: number;
    maxSelections: number;
  },
  context: z.RefinementCtx,
) {
  if (value.minSelections > value.maxSelections) {
    context.addIssue({
      code: 'custom',
      path: ['minSelections'],
      message: 'O mínimo de escolhas não pode ser maior que o máximo.',
    });
  }
  if (value.isRequired && value.minSelections < 1) {
    context.addIssue({
      code: 'custom',
      path: ['minSelections'],
      message: 'Um grupo obrigatório deve exigir ao menos uma escolha.',
    });
  }
  if (!value.isRequired && value.minSelections !== 0) {
    context.addIssue({
      code: 'custom',
      path: ['minSelections'],
      message: 'Um grupo opcional deve permitir zero escolhas.',
    });
  }
  if (!value.isMultiple && value.maxSelections !== 1) {
    context.addIssue({
      code: 'custom',
      path: ['maxSelections'],
      message: 'Um grupo de escolha única deve permitir exatamente uma escolha.',
    });
  }
}

export const createOptionGroupSchema = optionGroupSchema.superRefine(validateOptionGroupSelections);

export const updateOptionGroupSchema = optionGroupSchema
  .omit({ productId: true })
  .superRefine(validateOptionGroupSelections);

export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>;
export type UpdateOptionGroupInput = z.infer<typeof updateOptionGroupSchema>;

export const createOptionSchema = z.object({
  groupId: z.string().uuid('Grupo inválido.'),
  name: z
    .string()
    .trim()
    .min(1, 'Nome é obrigatório.')
    .max(80, 'Nome deve ter no máximo 80 caracteres.'),
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
