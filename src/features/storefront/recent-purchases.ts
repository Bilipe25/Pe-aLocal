import type { PublicRecentPurchaseProductDto } from '@/types/storefront';

export const RECENT_PURCHASE_WINDOW_DAYS = 180;
export const RECENT_PURCHASE_ORDER_LIMIT = 20;
export const RECENT_PURCHASE_PRODUCT_LIMIT = 8;

export const RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export const RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES = [
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;

export interface RecentPurchaseOrderSignal {
  purchasedAt: Date;
  productIds: string[];
}

export interface RecentPurchaseProductCandidate extends PublicRecentPurchaseProductDto {
  categorySortOrder: number;
  productSortOrder: number;
}

interface PurchaseMetric {
  lastPurchasedAt: number;
  purchaseCount: number;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' });
}

function collectPurchaseMetrics(orders: RecentPurchaseOrderSignal[]) {
  const metrics = new Map<string, PurchaseMetric>();

  for (const order of orders) {
    const purchasedAt = order.purchasedAt.getTime();
    for (const productId of new Set(order.productIds)) {
      const current = metrics.get(productId);
      metrics.set(productId, {
        lastPurchasedAt: Math.max(current?.lastPurchasedAt ?? 0, purchasedAt),
        purchaseCount: (current?.purchaseCount ?? 0) + 1,
      });
    }
  }

  return metrics;
}

function toPublicProduct(
  candidate: RecentPurchaseProductCandidate,
): PublicRecentPurchaseProductDto {
  return {
    id: candidate.id,
    name: candidate.name,
    description: candidate.description,
    imageUrl: candidate.imageUrl,
    imageAssetId: candidate.imageAssetId,
    basePrice: candidate.basePrice,
    isFeatured: candidate.isFeatured,
    isSoldOut: candidate.isSoldOut,
    category: candidate.category,
    isAvailable: candidate.isAvailable,
    requiresConfiguration: candidate.requiresConfiguration,
  };
}

/**
 * O ranking usa sinais históricos somente no servidor e retorna exclusivamente
 * o retrato público e atual dos produtos.
 */
export function rankRecentPurchaseProducts(
  orders: RecentPurchaseOrderSignal[],
  candidates: RecentPurchaseProductCandidate[],
  limit = RECENT_PURCHASE_PRODUCT_LIMIT,
): PublicRecentPurchaseProductDto[] {
  const metrics = collectPurchaseMetrics(orders);
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return [...uniqueCandidates.values()]
    .filter(
      (candidate) =>
        metrics.has(candidate.id) &&
        candidate.isAvailable &&
        !candidate.isSoldOut &&
        Number.isSafeInteger(candidate.basePrice) &&
        candidate.basePrice > 0,
    )
    .sort((left, right) => {
      const leftMetric = metrics.get(left.id)!;
      const rightMetric = metrics.get(right.id)!;
      if (leftMetric.lastPurchasedAt !== rightMetric.lastPurchasedAt) {
        return rightMetric.lastPurchasedAt - leftMetric.lastPurchasedAt;
      }
      if (leftMetric.purchaseCount !== rightMetric.purchaseCount) {
        return rightMetric.purchaseCount - leftMetric.purchaseCount;
      }
      if (left.categorySortOrder !== right.categorySortOrder) {
        return left.categorySortOrder - right.categorySortOrder;
      }
      if (left.productSortOrder !== right.productSortOrder) {
        return left.productSortOrder - right.productSortOrder;
      }
      const nameComparison = compareText(left.name, right.name);
      return nameComparison || left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, limit))
    .map(toPublicProduct);
}
