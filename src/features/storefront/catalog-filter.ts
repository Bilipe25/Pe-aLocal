import type { PublicStorefrontCategoryDto, PublicStorefrontProductDto } from '@/types/storefront';

export type CatalogSort = 'RELEVANCE' | 'PRICE_ASC' | 'PRICE_DESC';

export interface CatalogFilterState {
  query: string;
  sort: CatalogSort;
  onlyAvailable: boolean;
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function compareText(left: PublicStorefrontProductDto, right: PublicStorefrontProductDto) {
  return (
    left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }) ||
    left.id.localeCompare(right.id)
  );
}

export function sortCatalogProducts(
  products: PublicStorefrontProductDto[],
  sort: CatalogSort,
): PublicStorefrontProductDto[] {
  const order = new Map(products.map((product, index) => [product.id, index]));

  return [...products].sort((left, right) => {
    const availabilityDifference = Number(left.isSoldOut) - Number(right.isSoldOut);
    if (availabilityDifference !== 0) return availabilityDifference;

    if (sort === 'PRICE_ASC' || sort === 'PRICE_DESC') {
      const priceDifference = left.basePrice - right.basePrice;
      if (priceDifference !== 0) {
        return sort === 'PRICE_ASC' ? priceDifference : -priceDifference;
      }
      return compareText(left, right);
    }

    const featuredDifference = Number(right.isFeatured) - Number(left.isFeatured);
    if (featuredDifference !== 0) return featuredDifference;

    const storeOrderDifference = (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0);
    if (storeOrderDifference !== 0) return storeOrderDifference;

    return compareText(left, right);
  });
}

export function filterCatalog(
  categories: PublicStorefrontCategoryDto[],
  filters: CatalogFilterState,
): PublicStorefrontCategoryDto[] {
  const normalizedQuery = normalizeSearchText(filters.query);

  return categories
    .map((category) => {
      const categoryMatches = normalizeSearchText(category.name).includes(normalizedQuery);
      const products = category.products.filter((product) => {
        if (filters.onlyAvailable && product.isSoldOut) return false;
        if (!normalizedQuery) return true;
        return (
          categoryMatches ||
          normalizeSearchText(`${product.name} ${product.description ?? ''}`).includes(
            normalizedQuery,
          )
        );
      });

      return {
        ...category,
        products: sortCatalogProducts(products, filters.sort),
      };
    })
    .filter((category) => category.products.length > 0);
}
