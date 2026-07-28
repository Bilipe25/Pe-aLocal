import type { PublicCartRecommendationDto } from '@/types/storefront';

export const MAX_CART_RECOMMENDATION_POOL = 16;
export const MAX_VISIBLE_CART_RECOMMENDATIONS = 8;

export interface RankedCartRecommendation extends PublicCartRecommendationDto {
  categorySortOrder: number;
  productSortOrder: number;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' });
}

function isValidRecommendation(candidate: PublicCartRecommendationDto) {
  return (
    candidate.isAvailable && Number.isSafeInteger(candidate.basePrice) && candidate.basePrice > 0
  );
}

function uniqueByProductId<T extends PublicCartRecommendationDto>(candidates: T[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function diversifyCategories<T extends PublicCartRecommendationDto>(candidates: T[]) {
  const representedCategories = new Set<string>();
  const firstFromEachCategory: T[] = [];
  const remaining: T[] = [];

  for (const candidate of candidates) {
    if (representedCategories.has(candidate.category.id)) {
      remaining.push(candidate);
      continue;
    }
    representedCategories.add(candidate.category.id);
    firstFromEachCategory.push(candidate);
  }

  return [...firstFromEachCategory, ...remaining];
}

function toPublicRecommendation(candidate: RankedCartRecommendation): PublicCartRecommendationDto {
  return {
    id: candidate.id,
    name: candidate.name,
    basePrice: candidate.basePrice,
    imageUrl: candidate.imageUrl,
    imageAssetId: candidate.imageAssetId,
    category: candidate.category,
    isAvailable: candidate.isAvailable,
    isFeatured: candidate.isFeatured,
    requiresConfiguration: candidate.requiresConfiguration,
  };
}

/**
 * Ordena o pool no servidor sem depender de nomes de categoria como taxonomia.
 * A ordem comercial configurada é preservada depois de destaque e complexidade.
 */
export function rankCartRecommendationPool(
  candidates: RankedCartRecommendation[],
  limit = MAX_CART_RECOMMENDATION_POOL,
): PublicCartRecommendationDto[] {
  const sorted = uniqueByProductId(candidates)
    .filter(isValidRecommendation)
    .sort((left, right) => {
      if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
      if (left.requiresConfiguration !== right.requiresConfiguration) {
        return left.requiresConfiguration ? 1 : -1;
      }
      if (left.categorySortOrder !== right.categorySortOrder) {
        return left.categorySortOrder - right.categorySortOrder;
      }
      if (left.productSortOrder !== right.productSortOrder) {
        return left.productSortOrder - right.productSortOrder;
      }
      const nameComparison = compareText(left.name, right.name);
      return nameComparison || left.id.localeCompare(right.id);
    });

  return diversifyCategories(sorted).slice(0, Math.max(0, limit)).map(toPublicRecommendation);
}

/**
 * Exclui os itens atuais e prioriza categorias ainda não representadas no carrinho.
 * Para carrinhos antigos, cuja categoria não está persistida, a ordem segura do
 * servidor continua sendo usada sem inferência textual.
 */
export function selectCartRecommendations(
  candidates: PublicCartRecommendationDto[],
  cartProductIds: Iterable<string>,
  limit = MAX_VISIBLE_CART_RECOMMENDATIONS,
) {
  const currentProductIds = new Set(cartProductIds);
  const currentCategoryIds = new Set(
    candidates
      .filter((candidate) => currentProductIds.has(candidate.id))
      .map((candidate) => candidate.category.id),
  );
  const eligible = uniqueByProductId(candidates).filter(
    (candidate) => isValidRecommendation(candidate) && !currentProductIds.has(candidate.id),
  );
  const complementary: PublicCartRecommendationDto[] = [];
  const sameCategory: PublicCartRecommendationDto[] = [];

  for (const candidate of eligible) {
    if (currentCategoryIds.has(candidate.category.id)) sameCategory.push(candidate);
    else complementary.push(candidate);
  }

  return [...diversifyCategories(complementary), ...diversifyCategories(sameCategory)].slice(
    0,
    Math.max(0, limit),
  );
}
