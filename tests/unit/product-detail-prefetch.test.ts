import { describe, expect, it, vi } from 'vitest';

import {
  allowsPassiveProductDetailPrefetch,
  ProductDetailPrefetchQueue,
  STOREFRONT_PRODUCT_DETAIL_PREFETCH_CONCURRENCY,
} from '@/features/storefront/product-detail-prefetch';
import type { PublicStorefrontProductSummaryDto } from '@/types/storefront';

function product(id: string): PublicStorefrontProductSummaryDto {
  return {
    id,
    name: `Produto ${id}`,
    description: null,
    imageUrl: null,
    imageAssetId: null,
    basePrice: 1_000,
    isFeatured: false,
    isSoldOut: false,
  };
}

describe('prefetch adaptativo de detalhes do produto', () => {
  it('desabilita prefetch passivo em Save-Data e conexões 2G com fallback seguro', () => {
    expect(allowsPassiveProductDetailPrefetch(undefined)).toBe(true);
    expect(allowsPassiveProductDetailPrefetch({ connection: { saveData: true } })).toBe(false);
    expect(
      allowsPassiveProductDetailPrefetch({ connection: { effectiveType: 'slow-2g' } }),
    ).toBe(false);
    expect(
      allowsPassiveProductDetailPrefetch({ connection: { effectiveType: '2g' } }),
    ).toBe(false);
    expect(
      allowsPassiveProductDetailPrefetch({ connection: { effectiveType: '4g' } }),
    ).toBe(true);
  });

  it('mantém no máximo duas requests passivas concorrentes', async () => {
    const resolvers: Array<() => void> = [];
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const queue = new ProductDetailPrefetchQueue(load, vi.fn());

    queue.enqueue(product('1'), 'viewport');
    queue.enqueue(product('2'), 'viewport');
    queue.enqueue(product('3'), 'viewport');

    expect(load).toHaveBeenCalledTimes(STOREFRONT_PRODUCT_DETAIL_PREFETCH_CONCURRENCY);
    resolvers[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('prioriza intenção forte sobre itens apenas próximos do viewport', async () => {
    const order: string[] = [];
    const resolvers: Array<() => void> = [];
    const queue = new ProductDetailPrefetchQueue(
      (candidate) => {
        order.push(candidate.id);
        return new Promise<void>((resolve) => resolvers.push(resolve));
      },
      vi.fn(),
      1,
    );

    queue.enqueue(product('active'), 'viewport');
    queue.enqueue(product('nearby'), 'viewport');
    queue.enqueue(product('focused'), 'intent');
    expect(order).toEqual(['active']);

    resolvers[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['active', 'focused']);
  });
});
