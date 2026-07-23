import { describe, expect, it } from 'vitest';

import {
  createCategorySchema,
  createProductSchema,
  productAvailabilitySchema,
} from '@/schemas/catalog';

describe('schemas do catálogo', () => {
  it('normaliza nomes e rejeita texto composto apenas por espaços', () => {
    expect(createCategorySchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createProductSchema.parse({
        categoryId: '4da03571-bffd-45ef-8c44-20686c487838',
        name: '  X-Burger  ',
        basePrice: '24.90',
      }).name,
    ).toBe('X-Burger');
  });

  it('aceita somente os campos de disponibilidade autorizados', () => {
    expect(productAvailabilitySchema.parse({ isSoldOut: true })).toEqual({ isSoldOut: true });
    expect(productAvailabilitySchema.safeParse({}).success).toBe(false);
    expect(productAvailabilitySchema.safeParse({ isSoldOut: true, basePrice: 0 }).success).toBe(
      false,
    );
  });
});
