import { describe, expect, it } from 'vitest';

import {
  rankCartRecommendationPool,
  selectCartRecommendations,
  type RankedCartRecommendation,
} from '@/features/storefront/cart-recommendations';

function recommendation(
  id: string,
  overrides: Partial<RankedCartRecommendation> = {},
): RankedCartRecommendation {
  return {
    id,
    name: `Produto ${id}`,
    basePrice: 1_000,
    imageUrl: null,
    imageAssetId: null,
    category: { id: 'category-main', name: 'Principais' },
    isAvailable: true,
    isFeatured: false,
    requiresConfiguration: false,
    categorySortOrder: 1_000,
    productSortOrder: 1_000,
    ...overrides,
  };
}

describe('recomendações do carrinho', () => {
  it('exclui indisponíveis, preços inválidos e IDs duplicados', () => {
    const result = rankCartRecommendationPool([
      recommendation('valid'),
      recommendation('unavailable', { isAvailable: false }),
      recommendation('free', { basePrice: 0 }),
      recommendation('valid', { name: 'Duplicado' }),
    ]);

    expect(result.map((item) => item.id)).toEqual(['valid']);
  });

  it('prioriza destaque, menor complexidade e ordem comercial de forma determinística', () => {
    const candidates = [
      recommendation('configured-featured', {
        isFeatured: true,
        requiresConfiguration: true,
        productSortOrder: 100,
      }),
      recommendation('simple-featured-later', {
        isFeatured: true,
        productSortOrder: 200,
      }),
      recommendation('simple-featured-first', {
        isFeatured: true,
        productSortOrder: 100,
      }),
      recommendation('regular', { productSortOrder: 50 }),
    ];

    const forward = rankCartRecommendationPool(candidates);
    const reversed = rankCartRecommendationPool([...candidates].reverse());

    expect(forward.map((item) => item.id)).toEqual([
      'simple-featured-first',
      'simple-featured-later',
      'configured-featured',
      'regular',
    ]);
    expect(reversed).toEqual(forward);
  });

  it('exclui o carrinho e prioriza categorias diferentes antes da categoria atual', () => {
    const pool = rankCartRecommendationPool([
      recommendation('burger-current'),
      recommendation('burger-extra', { isFeatured: true, productSortOrder: 2_000 }),
      recommendation('drink', {
        category: { id: 'category-drinks', name: 'Bebidas' },
        categorySortOrder: 2_000,
      }),
      recommendation('dessert', {
        category: { id: 'category-desserts', name: 'Sobremesas' },
        categorySortOrder: 3_000,
      }),
    ]);

    const result = selectCartRecommendations(pool, ['burger-current']);

    expect(result.map((item) => item.id)).toEqual(['drink', 'dessert', 'burger-extra']);
    expect(result).not.toContainEqual(expect.objectContaining({ id: 'burger-current' }));
  });

  it('distribui a primeira rodada entre categorias e respeita o limite máximo', () => {
    const pool = rankCartRecommendationPool([
      recommendation('main-1', { isFeatured: true }),
      recommendation('main-2', { productSortOrder: 2_000 }),
      recommendation('drink-1', {
        category: { id: 'drinks', name: 'Bebidas' },
        categorySortOrder: 2_000,
      }),
      recommendation('dessert-1', {
        category: { id: 'desserts', name: 'Sobremesas' },
        categorySortOrder: 3_000,
      }),
    ]);

    expect(selectCartRecommendations(pool, [], 3).map((item) => item.id)).toEqual([
      'main-1',
      'drink-1',
      'dessert-1',
    ]);
    expect(selectCartRecommendations(pool, [], 2)).toHaveLength(2);
  });

  it('retorna vazio quando não existe sugestão elegível', () => {
    const pool = rankCartRecommendationPool([recommendation('only')]);
    expect(selectCartRecommendations(pool, ['only'])).toEqual([]);
  });
});
