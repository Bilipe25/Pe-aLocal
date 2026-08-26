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
  const value = useMemo<StorefrontClientStateContextValue>(
    () => ({
      storeId,
      storeSlug,
      hydrated: hydratedStoreId === storeId,
      getCatalogMemory,
      updateCatalogMemory,
    }),
    [getCatalogMemory, hydratedStoreId, storeId, storeSlug, updateCatalogMemory],
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
