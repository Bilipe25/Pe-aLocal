'use client';

import { create } from 'zustand';

export const FAVORITES_STORAGE_KEY_PREFIX = 'pedidolocal:favorites:';
const FAVORITES_STORAGE_VERSION = 1;
const MAX_FAVORITES = 1_000;

interface PersistedFavorites {
  version: typeof FAVORITES_STORAGE_VERSION;
  storeId: string;
  productIds: string[];
}

interface FavoritesState {
  storeId: string | null;
  productIds: string[];
  setStore: (storeId: string, availableProductIds: string[]) => void;
  mergeProductIds: (storeId: string, productIds: string[]) => string[];
  configureServerSync: (storeId: string, storeSlug: string, enabled: boolean) => void;
  toggleFavorite: (productId: string) => boolean;
}

interface ServerSyncTarget {
  storeId: string;
  storeSlug: string;
}

let serverSyncTarget: ServerSyncTarget | null = null;

export function getFavoritesStorageKey(storeId: string) {
  return `${FAVORITES_STORAGE_KEY_PREFIX}${storeId}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredFavorites(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Favoritos continuam funcionais em memória quando o storage está indisponível.
  }
}

export function writeFavorites(storage: Storage | null, storeId: string, productIds: string[]) {
  if (!storage) return;
  const key = getFavoritesStorageKey(storeId);
  const uniqueProductIds = [...new Set(productIds.filter(Boolean))].slice(0, MAX_FAVORITES);

  try {
    if (uniqueProductIds.length === 0) {
      storage.removeItem(key);
      return;
    }

    const persisted: PersistedFavorites = {
      version: FAVORITES_STORAGE_VERSION,
      storeId,
      productIds: uniqueProductIds,
    };
    storage.setItem(key, JSON.stringify(persisted));
  } catch {
    // Quota, privacidade ou indisponibilidade não impedem o uso durante a sessão.
  }
}

export function readFavorites(
  storage: Storage | null,
  storeId: string,
  availableProductIds: string[],
) {
  void availableProductIds;
  if (!storage) return [];
  const key = getFavoritesStorageKey(storeId);
  let raw: string | null;

  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('version' in parsed) ||
      parsed.version !== FAVORITES_STORAGE_VERSION ||
      !('storeId' in parsed) ||
      parsed.storeId !== storeId ||
      !('productIds' in parsed) ||
      !Array.isArray(parsed.productIds) ||
      parsed.productIds.length > MAX_FAVORITES ||
      parsed.productIds.some((productId) => typeof productId !== 'string' || !productId)
    ) {
      removeStoredFavorites(storage, key);
      return [];
    }

    // Um favorito continua pertencendo ao consumidor mesmo quando o item fica
    // temporariamente indisponível ou sai da resposta pública do catálogo.
    const productIds = [...new Set(parsed.productIds)];
    if (productIds.length !== parsed.productIds.length) {
      writeFavorites(storage, storeId, productIds);
    }
    return productIds;
  } catch {
    removeStoredFavorites(storage, key);
    return [];
  }
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  storeId: null,
  productIds: [],

  setStore: (storeId, availableProductIds) => {
    const productIds = readFavorites(getBrowserStorage(), storeId, availableProductIds);
    const current = get();
    if (
      current.storeId === storeId &&
      current.productIds.length === productIds.length &&
      current.productIds.every((productId, index) => productId === productIds[index])
    ) {
      return;
    }
    set({ storeId, productIds });
  },

  mergeProductIds: (storeId, incomingProductIds) => {
    const current = get();
    const localProductIds =
      current.storeId === storeId
        ? current.productIds
        : readFavorites(getBrowserStorage(), storeId, []);
    const productIds = [...new Set([...localProductIds, ...incomingProductIds])].slice(
      -MAX_FAVORITES,
    );
    set({ storeId, productIds });
    writeFavorites(getBrowserStorage(), storeId, productIds);
    return productIds;
  },

  configureServerSync: (storeId, storeSlug, enabled) => {
    serverSyncTarget = enabled ? { storeId, storeSlug } : null;
  },

  toggleFavorite: (productId) => {
    const current = get();
    if (!current.storeId || !productId) return false;
    const isFavorite = current.productIds.includes(productId);
    const productIds = isFavorite
      ? current.productIds.filter((candidate) => candidate !== productId)
      : [...current.productIds, productId].slice(-MAX_FAVORITES);
    set({ productIds });
    writeFavorites(getBrowserStorage(), current.storeId, productIds);
    if (serverSyncTarget?.storeId === current.storeId) {
      void fetch(
        `/api/storefront/${encodeURIComponent(serverSyncTarget.storeSlug)}/consumer/favorites`,
        {
          method: isFavorite ? 'DELETE' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        },
      ).catch(() => undefined);
    }
    return !isFavorite;
  },
}));
