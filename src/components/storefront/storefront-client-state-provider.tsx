'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ConsumerFavoritesSync } from '@/components/storefront/consumer-favorites-sync';
import { subscribeToCartStorage, useCartStore } from '@/stores/cart-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import {
  subscribeToPublicOrderHistoryStorage,
  usePublicOrderHistoryStore,
} from '@/stores/public-order-history-store';
import type { PublicStorefrontProductDetailDto } from '@/types/storefront';

export const STOREFRONT_PRODUCT_DETAIL_CACHE_TTL_MS = 60_000;
export const STOREFRONT_PRODUCT_DETAIL_CACHE_MAX_ENTRIES = 24;

export interface StorefrontCatalogMemory {
  search: string;
  sort: 'RELEVANCE' | 'PRICE_ASC' | 'PRICE_DESC';
  onlyAvailable: boolean;
  activeCategoryId: string | null;
  scrollY: number;
}

const EMPTY_CATALOG_MEMORY: StorefrontCatalogMemory = {
  search: '',
  sort: 'RELEVANCE',
  onlyAvailable: false,
  activeCategoryId: null,
  scrollY: 0,
};

interface StorefrontClientStateContextValue {
  storeId: string;
  storeSlug: string;
  hydrated: boolean;
  getCatalogMemory: () => StorefrontCatalogMemory;
  updateCatalogMemory: (patch: Partial<StorefrontCatalogMemory>) => void;
  getCachedProductDetail: (productId: string) => PublicStorefrontProductDetailDto | null;
  cacheProductDetail: (productId: string, detail: PublicStorefrontProductDetailDto) => void;
  requestProductDetail: (
    productId: string,
    loader: () => Promise<PublicStorefrontProductDetailDto>,
    options?: { bypassCache?: boolean },
  ) => Promise<PublicStorefrontProductDetailDto>;
}

const StorefrontClientStateContext = createContext<StorefrontClientStateContextValue | null>(null);

export function StorefrontClientStateProvider({
  children,
  storeId,
  storeSlug,
}: {
  children: ReactNode;
  storeId: string;
  storeSlug: string;
}) {
  const [hydratedStoreId, setHydratedStoreId] = useState<string | null>(null);
  const catalogMemoryByStoreRef = useRef(new Map<string, StorefrontCatalogMemory>());
  const productDetailsByStoreRef = useRef(
    new Map<string, Map<string, { detail: PublicStorefrontProductDetailDto; expiresAt: number }>>(),
  );
  const productDetailRequestsByStoreRef = useRef(
    new Map<string, Map<string, Promise<PublicStorefrontProductDetailDto>>>(),
  );

  useLayoutEffect(() => {
    const cart = useCartStore.getState();
    const favorites = useFavoritesStore.getState();
    const orderHistory = usePublicOrderHistoryStore.getState();

    cart.setStore(storeId, storeSlug);
    favorites.setStore(storeId, []);
    orderHistory.setStore(storeId, storeSlug);

    const unsubscribeCart = subscribeToCartStorage(storeId, storeSlug);
    const unsubscribeOrderHistory = subscribeToPublicOrderHistoryStorage(storeId, storeSlug);
    let active = true;
    queueMicrotask(() => {
      if (active) setHydratedStoreId(storeId);
    });

    return () => {
      active = false;
      unsubscribeCart();
      unsubscribeOrderHistory();
    };
  }, [storeId, storeSlug]);

  const getCatalogMemory = useCallback(
    () => catalogMemoryByStoreRef.current.get(storeId) ?? EMPTY_CATALOG_MEMORY,
    [storeId],
  );
  const updateCatalogMemory = useCallback(
    (patch: Partial<StorefrontCatalogMemory>) => {
      const current = catalogMemoryByStoreRef.current.get(storeId) ?? EMPTY_CATALOG_MEMORY;
      catalogMemoryByStoreRef.current.set(storeId, { ...current, ...patch });
    },
    [storeId],
  );
  const getCachedProductDetail = useCallback(
    (productId: string) => {
      const storeCache = productDetailsByStoreRef.current.get(storeId);
      const cached = storeCache?.get(productId);
      if (!cached) return null;
      if (cached.expiresAt > Date.now()) {
        storeCache?.delete(productId);
        storeCache?.set(productId, cached);
        return cached.detail;
      }

      storeCache?.delete(productId);
      if (storeCache?.size === 0) productDetailsByStoreRef.current.delete(storeId);
      return null;
    },
    [storeId],
  );
  const cacheProductDetail = useCallback(
    (productId: string, detail: PublicStorefrontProductDetailDto) => {
      const storeCache = productDetailsByStoreRef.current.get(storeId) ?? new Map();
      const now = Date.now();
      for (const [cachedProductId, cached] of storeCache) {
        if (cached.expiresAt <= now) storeCache.delete(cachedProductId);
      }
      storeCache.delete(productId);
      while (storeCache.size >= STOREFRONT_PRODUCT_DETAIL_CACHE_MAX_ENTRIES) {
        const leastRecentlyUsedProductId = storeCache.keys().next().value;
        if (typeof leastRecentlyUsedProductId !== 'string') break;
        storeCache.delete(leastRecentlyUsedProductId);
      }
      storeCache.set(productId, {
        detail,
        expiresAt: now + STOREFRONT_PRODUCT_DETAIL_CACHE_TTL_MS,
      });
      productDetailsByStoreRef.current.set(storeId, storeCache);
    },
    [storeId],
  );
  const requestProductDetail = useCallback(
    (
      productId: string,
      loader: () => Promise<PublicStorefrontProductDetailDto>,
      options?: { bypassCache?: boolean },
    ) => {
      if (!options?.bypassCache) {
        const cached = getCachedProductDetail(productId);
        if (cached) return Promise.resolve(cached);
      }

      const storeRequests = productDetailRequestsByStoreRef.current.get(storeId) ?? new Map();
      const inFlight = storeRequests.get(productId);
      if (inFlight) return inFlight;

      const request = Promise.resolve()
        .then(loader)
        .then((detail) => {
          cacheProductDetail(productId, detail);
          return detail;
        })
        .finally(() => {
          if (storeRequests.get(productId) === request) storeRequests.delete(productId);
          if (storeRequests.size === 0) productDetailRequestsByStoreRef.current.delete(storeId);
        });
      storeRequests.set(productId, request);
      productDetailRequestsByStoreRef.current.set(storeId, storeRequests);
      return request;
    },
    [cacheProductDetail, getCachedProductDetail, storeId],
  );
  const value = useMemo<StorefrontClientStateContextValue>(
    () => ({
      storeId,
      storeSlug,
      hydrated: hydratedStoreId === storeId,
      getCatalogMemory,
      updateCatalogMemory,
      getCachedProductDetail,
      cacheProductDetail,
      requestProductDetail,
    }),
    [
      cacheProductDetail,
      getCachedProductDetail,
      getCatalogMemory,
      hydratedStoreId,
      requestProductDetail,
      storeId,
      storeSlug,
      updateCatalogMemory,
    ],
  );

  return (
    <StorefrontClientStateContext.Provider value={value}>
      <ConsumerFavoritesSync storeId={storeId} storeSlug={storeSlug} />
      {children}
    </StorefrontClientStateContext.Provider>
  );
}

/** Retorna null em superfícies independentes, como a experiência de mesa. */
export function useOptionalStorefrontClientState() {
  return useContext(StorefrontClientStateContext);
}
