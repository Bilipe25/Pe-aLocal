import type {
  PublicStorefrontCategoryDto,
  PublicStorefrontProductSummaryDto,
} from '@/types/storefront';

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

function compareText(
  left: PublicStorefrontProductSummaryDto,
  right: PublicStorefrontProductSummaryDto,
) {
  return (
    left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }) ||
    left.id.localeCompare(right.id)
  );
}

export function sortCatalogProducts(
  products: readonly PublicStorefrontProductSummaryDto[],
  sort: CatalogSort,
): PublicStorefrontProductSummaryDto[] {
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

export interface CatalogIndex {
  filter(filters: CatalogFilterState): PublicStorefrontCategoryDto[];
}

export function createCatalogIndex(
  categories: readonly PublicStorefrontCategoryDto[],
): CatalogIndex {
  const indexedCategories = categories.map((category) => {
    const normalizedProductText = new Map(
      category.products.map(
        (product) =>
          [product, normalizeSearchText(`${product.name} ${product.description ?? ''}`)] as const,
      ),
    );
    const sortedProducts = new Map<CatalogSort, readonly PublicStorefrontProductSummaryDto[]>();

    return {
      source: category,
      normalizedName: normalizeSearchText(category.name),
      normalizedProductText,
      sortedProducts,
    };
  });

  return {
    filter(filters) {
      const normalizedQuery = normalizeSearchText(filters.query);

      return indexedCategories.flatMap((category) => {
        let orderedProducts = category.sortedProducts.get(filters.sort);
        if (!orderedProducts) {
          orderedProducts = sortCatalogProducts(category.source.products, filters.sort);
          category.sortedProducts.set(filters.sort, orderedProducts);
        }

        const categoryMatches = category.normalizedName.includes(normalizedQuery);
        const products = orderedProducts.filter((product) => {
          if (filters.onlyAvailable && product.isSoldOut) return false;
          if (!normalizedQuery) return true;
          return (
            categoryMatches ||
            category.normalizedProductText.get(product)?.includes(normalizedQuery) === true
          );
        });

        return products.length > 0
          ? [
              {
                ...category.source,
                products,
              },
            ]
          : [];
      });
    },
  };
}

export function filterIndexedCatalog(
  index: CatalogIndex,
  filters: CatalogFilterState,
): PublicStorefrontCategoryDto[] {
  return index.filter(filters);
}

export function filterCatalog(
  categories: readonly PublicStorefrontCategoryDto[],
  filters: CatalogFilterState,
): PublicStorefrontCategoryDto[] {
  return createCatalogIndex(categories).filter(filters);
}
