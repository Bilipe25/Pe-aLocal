import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { catalogValidationError } from '@/features/catalog/catalog-validation';
import { actionError } from '@/server/errors';

describe('catalogValidationError', () => {
  it('preserva uma mensagem segura e os campos inválidos para a action', () => {
    const parsed = z
      .object({
        name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres.'),
        basePrice: z.coerce.number().min(0, 'Preço não pode ser negativo.'),
      })
      .safeParse({ name: '', basePrice: '-1' });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(actionError(catalogValidationError(parsed.error))).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Nome deve ter pelo menos 2 caracteres.',
        details: [
          { field: 'name', message: 'Nome deve ter pelo menos 2 caracteres.' },
          { field: 'basePrice', message: 'Preço não pode ser negativo.' },
        ],
      },
    });
  });
});
