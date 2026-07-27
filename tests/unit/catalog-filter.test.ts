import { describe, expect, it } from 'vitest';

import {
  createCatalogIndex,
  filterCatalog,
  filterIndexedCatalog,
  sortCatalogProducts,
  type CatalogFilterState,
  type CatalogSort,
} from '@/features/storefront/catalog-filter';
import type {
  PublicStorefrontCategoryDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

function product(
  id: string,
  name: string,
  basePrice: number,
  options: Partial<PublicStorefrontProductSummaryDto> = {},
): PublicStorefrontProductSummaryDto {
  return {
    id,
    name,
    description: null,
    imageUrl: null,
    imageAssetId: null,
    basePrice,
    isFeatured: false,
    isSoldOut: false,
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
      product('accented', 'Clássico', 2_700, {
        description: 'Pão artesanal com queijo',
      }),
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

const expectedOrders: Record<CatalogSort, string[]> = {
  RELEVANCE: ['featured', 'regular', 'same-price-b', 'same-price-a', 'accented', 'sold-out'],
  PRICE_ASC: ['regular', 'same-price-a', 'same-price-b', 'accented', 'featured', 'sold-out'],
  PRICE_DESC: ['featured', 'accented', 'same-price-a', 'same-price-b', 'regular', 'sold-out'],
};

function filters(overrides: Partial<CatalogFilterState> = {}): CatalogFilterState {
  return {
    query: '',
    sort: 'RELEVANCE',
    onlyAvailable: false,
    ...overrides,
  };
}

describe('filtros e ordenação do catálogo público', () => {
  it.each(Object.entries(expectedOrders) as [CatalogSort, string[]][])(
    'preserva a ordenação determinística em %s',
    (sort, expected) => {
      const result = sortCatalogProducts(categories[0].products, sort);

      expect(result.map((item) => item.id)).toEqual(expected);
    },
  );

  it.each(['classico', 'CLÁSSICO', '  clássico  '])(
    'encontra produto ignorando acentos, caixa e espaços na busca %j',
    (query) => {
      const result = filterCatalog(categories, filters({ query }));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('category-main');
      expect(result[0].products.map((item) => item.id)).toEqual(['accented']);
    },
  );

  it('considera a categoria na busca e mantém sua ordenação selecionada', () => {
    const result = filterCatalog(
      categories,
      filters({
        query: 'hamburguer',
        sort: 'PRICE_ASC',
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('category-main');
    expect(result[0].products.map((item) => item.id)).toEqual(expectedOrders.PRICE_ASC);
  });

  it('combina categoria, ordenação e somente produtos disponíveis', () => {
    const result = filterCatalog(
      categories,
      filters({
        query: 'hambúrguer',
        sort: 'PRICE_DESC',
        onlyAvailable: true,
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].products.map((item) => item.id)).toEqual(
      expectedOrders.PRICE_DESC.filter((id) => id !== 'sold-out'),
    );
    expect(result[0].products.every((item) => !item.isSoldOut)).toBe(true);
  });

  it('mantém equivalência entre filtragem direta e índice reutilizável', () => {
    const index = createCatalogIndex(categories);
    const scenarios: CatalogFilterState[] = [
      filters(),
      filters({ query: 'pao' }),
      filters({ query: 'BEBIDAS', sort: 'PRICE_DESC' }),
      filters({ sort: 'PRICE_ASC', onlyAvailable: true }),
      filters({ query: 'inexistente', sort: 'PRICE_DESC', onlyAvailable: true }),
    ];

    for (const scenario of scenarios) {
      expect(filterIndexedCatalog(index, scenario)).toEqual(filterCatalog(categories, scenario));
    }
  });

  it('produz resultados independentes e estáveis em chamadas repetidas', () => {
    const index = createCatalogIndex(categories);
    const selectedFilters = filters({ sort: 'PRICE_ASC', onlyAvailable: true });

    const first = filterIndexedCatalog(index, selectedFilters);
    const second = filterIndexedCatalog(index, selectedFilters);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].products).not.toBe(first[0].products);
    expect(second[0].products[0]).toBe(first[0].products[0]);

    first[0].products.reverse();
    first.pop();

    const third = filterIndexedCatalog(index, selectedFilters);
    expect(third.map((category) => category.id)).toEqual(['category-main', 'category-drinks']);
    expect(third[0].products.map((item) => item.id)).toEqual(
      expectedOrders.PRICE_ASC.filter((id) => id !== 'sold-out'),
    );
  });

  it('não muta categorias nem produtos recebidos', () => {
    const original = structuredClone(categories);

    sortCatalogProducts(categories[0].products, 'PRICE_DESC');
    filterCatalog(
      categories,
      filters({
        query: 'hamburguer',
        sort: 'PRICE_ASC',
        onlyAvailable: true,
      }),
    );

    expect(categories).toEqual(original);
  });
});
