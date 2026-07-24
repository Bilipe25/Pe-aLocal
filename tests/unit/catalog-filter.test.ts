import { describe, expect, it } from 'vitest';

import { filterCatalog, sortCatalogProducts } from '@/features/storefront/catalog-filter';
import type { PublicStorefrontCategoryDto, PublicStorefrontProductDto } from '@/types/storefront';

function product(
  id: string,
  name: string,
  basePrice: number,
  options: Partial<PublicStorefrontProductDto> = {},
): PublicStorefrontProductDto {
  return {
    id,
    name,
    description: null,
    imageUrl: null,
    imageAssetId: null,
    basePrice,
    isFeatured: false,
    isSoldOut: false,
    allowNotes: false,
    optionGroups: [],
    ...options,
  };
}

const categories: PublicStorefrontCategoryDto[] = [
  {
    id: 'category-main',
    name: 'Hambúrgueres',
    description: null,
    image: null,
    products: [
      product('regular', 'X-Salada', 2_200),
      product('sold-out', 'X-Esgotado', 1_500, { isSoldOut: true }),
      product('featured', 'Especial da casa', 3_000, { isFeatured: true }),
      product('same-price-b', 'Bacon', 2_500),
      product('same-price-a', 'Artesanal', 2_500),
    ],
  },
  {
    id: 'category-drinks',
    name: 'Bebidas',
    description: null,
    image: null,
    products: [product('juice', 'Suco de laranja', 800)],
  },
];

describe('filtros e ordenação do catálogo público', () => {
  it('ordena relevância de forma determinística', () => {
    const result = sortCatalogProducts(categories[0].products, 'RELEVANCE');

    expect(result.map((item) => item.id)).toEqual([
      'featured',
      'regular',
      'same-price-b',
      'same-price-a',
      'sold-out',
    ]);
  });

  it('ordena por menor preço e mantém esgotados por último', () => {
    const result = sortCatalogProducts(categories[0].products, 'PRICE_ASC');

    expect(result.map((item) => item.id)).toEqual([
      'regular',
      'same-price-a',
      'same-price-b',
      'featured',
      'sold-out',
    ]);
  });

  it('ordena por maior preço com desempate estável por nome', () => {
    const result = sortCatalogProducts(categories[0].products, 'PRICE_DESC');

    expect(result.map((item) => item.id)).toEqual([
      'featured',
      'same-price-a',
      'same-price-b',
      'regular',
      'sold-out',
    ]);
  });

  it('filtra somente disponíveis sem mutar a entrada', () => {
    const original = categories[0].products.map((item) => item.id);
    const result = filterCatalog(categories, {
      query: '',
      sort: 'RELEVANCE',
      onlyAvailable: true,
    });

    expect(result.flatMap((category) => category.products).every((item) => !item.isSoldOut)).toBe(
      true,
    );
    expect(categories[0].products.map((item) => item.id)).toEqual(original);
  });

  it('combina busca sem acento, categoria, disponibilidade e preço', () => {
    const byProduct = filterCatalog(categories, {
      query: 'hamburguer',
      sort: 'PRICE_ASC',
      onlyAvailable: true,
    });
    const byCategory = filterCatalog(categories, {
      query: 'bebidas',
      sort: 'PRICE_DESC',
      onlyAvailable: false,
    });

    expect(byProduct).toHaveLength(1);
    expect(byProduct[0].products.map((item) => item.id)).not.toContain('sold-out');
    expect(byCategory).toHaveLength(1);
    expect(byCategory[0].products.map((item) => item.id)).toEqual(['juice']);
  });
});
