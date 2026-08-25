'use client';

import { useEffect } from 'react';

import { useFavoritesStore } from '@/stores/favorites-store';

function isFavoritesResponse(value: unknown): value is { productIds: string[] } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'productIds' in value &&
    Array.isArray(value.productIds) &&
    value.productIds.every((productId) => typeof productId === 'string'),
  );
}

export function ConsumerFavoritesSync(props: { storeId: string; storeSlug: string }) {
  const mergeProductIds = useFavoritesStore((state) => state.mergeProductIds);
  const configureServerSync = useFavoritesStore((state) => state.configureServerSync);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = `/api/storefront/${encodeURIComponent(props.storeSlug)}/consumer/favorites`;

    async function synchronize() {
      try {
        const response = await fetch(endpoint, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (!isFavoritesResponse(payload)) return;
        const productIds = mergeProductIds(props.storeId, payload.productIds);
        const merged = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds }),
          signal: controller.signal,
        });
        if (merged.ok) configureServerSync(props.storeId, props.storeSlug, true);
      } catch {
        // Favoritos locais seguem funcionando offline e sem uma conta ativa.
      }
    }

    void synchronize();
    return () => {
      controller.abort();
      configureServerSync(props.storeId, props.storeSlug, false);
    };
  }, [configureServerSync, mergeProductIds, props.storeId, props.storeSlug]);

  return null;
}
