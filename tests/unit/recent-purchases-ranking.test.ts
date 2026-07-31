import { describe, expect, it } from 'vitest';

import {
  RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES,
  RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES,
  RECENT_PURCHASE_ORDER_LIMIT,
  RECENT_PURCHASE_PRODUCT_LIMIT,
  RECENT_PURCHASE_WINDOW_DAYS,
  rankRecentPurchaseProducts,
  type RecentPurchaseProductCandidate,
} from '@/features/storefront/recent-purchases';

function candidate(
  id: string,
  overrides: Partial<RecentPurchaseProductCandidate> = {},
): RecentPurchaseProductCandidate {
  return {
    id,
    name: `Produto ${id}`,
    description: null,
    imageUrl: `/produto-${id}.jpg`,
    imageAssetId: null,
    basePrice: 1_000,
    isAvailable: true,
    isFeatured: false,
    isSoldOut: false,
    category: { id: 'category-a', name: 'Lanches' },
    requiresConfiguration: false,
    categorySortOrder: 0,
    productSortOrder: 0,
    ...overrides,
  };
}

describe('ranking de produtos comprados recentemente', () => {
  it('mantém critérios e limites explícitos do produto', () => {
    expect(RECENT_PURCHASE_ELIGIBLE_ORDER_STATUSES).toEqual([
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(RECENT_PURCHASE_EXCLUDED_PAYMENT_STATUSES).toEqual(['FAILED', 'CANCELLED', 'REFUNDED']);
    expect(RECENT_PURCHASE_WINDOW_DAYS).toBe(180);
    expect(RECENT_PURCHASE_ORDER_LIMIT).toBe(20);
    expect(RECENT_PURCHASE_PRODUCT_LIMIT).toBe(8);
  });

  it('prioriza recência, frequência e ordem comercial com desempate estável', () => {
    const result = rankRecentPurchaseProducts(
      [
        {
          purchasedAt: new Date('2026-07-29T12:00:00.000Z'),
          productIds: ['recent'],
        },
        {
          purchasedAt: new Date('2026-07-20T12:00:00.000Z'),
          productIds: ['frequent', 'frequent'],
        },
        {
          purchasedAt: new Date('2026-07-10T12:00:00.000Z'),
          productIds: ['frequent'],
        },
        {
          purchasedAt: new Date('2026-07-01T12:00:00.000Z'),
          productIds: ['commercial-b', 'commercial-a'],
        },
      ],
      [
        candidate('commercial-b', { categorySortOrder: 2, productSortOrder: 0 }),
        candidate('recent'),
        candidate('commercial-a', { categorySortOrder: 1, productSortOrder: 4 }),
        candidate('frequent'),
      ],
    );

    expect(result.map((product) => product.id)).toEqual([
      'recent',
      'frequent',
      'commercial-a',
      'commercial-b',
    ]);
  });

  it('remove duplicados, indisponíveis, esgotados e preços inválidos', () => {
    const result = rankRecentPurchaseProducts(
      [
        {
          purchasedAt: new Date('2026-07-29T12:00:00.000Z'),
          productIds: ['valid', 'sold-out', 'unavailable', 'invalid-price', 'removed'],
        },
      ],
      [
        candidate('valid', {
          name: 'Nome atual',
          imageUrl: '/imagem-atual.jpg',
          basePrice: 2_390,
        }),
        candidate('valid', { name: 'Duplicado descartado' }),
        candidate('sold-out', { isSoldOut: true }),
        candidate('unavailable', { isAvailable: false }),
        candidate('invalid-price', { basePrice: 0 }),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'valid',
        name: 'Duplicado descartado',
        imageUrl: '/produto-valid.jpg',
        basePrice: 1_000,
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/lastPurchasedAt|purchaseCount|customer|order/i);
  });

  it('respeita o limite sem tornar o resultado não determinístico', () => {
    const orders = Array.from({ length: 12 }, (_, index) => ({
      purchasedAt: new Date(Date.UTC(2026, 6, 30 - index)),
      productIds: [`product-${index}`],
    }));
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(`product-${index}`));

    expect(rankRecentPurchaseProducts(orders, candidates)).toHaveLength(8);
    expect(rankRecentPurchaseProducts(orders, candidates, 3).map((product) => product.id)).toEqual([
      'product-0',
      'product-1',
      'product-2',
    ]);
  });
});
