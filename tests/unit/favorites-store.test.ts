import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getFavoritesStorageKey,
  readFavorites,
  useFavoritesStore,
  writeFavorites,
} from '@/stores/favorites-store';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('favoritos por estabelecimento', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    useFavoritesStore.setState({ storeId: null, productIds: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persiste somente IDs públicos e isola lojas diferentes', () => {
    useFavoritesStore.getState().setStore('store-a', ['product-a', 'product-b']);
    expect(useFavoritesStore.getState().toggleFavorite('product-a')).toBe(true);

    useFavoritesStore.getState().setStore('store-b', ['product-a']);
    expect(useFavoritesStore.getState().productIds).toEqual([]);

    useFavoritesStore.getState().setStore('store-a', ['product-a', 'product-b']);
    expect(useFavoritesStore.getState().productIds).toEqual(['product-a']);
    expect(JSON.parse(storage.getItem(getFavoritesStorageKey('store-a')) ?? '{}')).toEqual({
      version: 1,
      storeId: 'store-a',
      productIds: ['product-a'],
    });
  });

  it('remove IDs de produtos que deixaram o catálogo', () => {
    writeFavorites(storage, 'store-a', ['product-a', 'product-removed']);

    expect(readFavorites(storage, 'store-a', ['product-a'])).toEqual(['product-a']);
    expect(JSON.parse(storage.getItem(getFavoritesStorageKey('store-a')) ?? '{}')).toMatchObject({
      productIds: ['product-a'],
    });
  });

  it('descarta storage corrompido sem quebrar a página', () => {
    storage.setItem(getFavoritesStorageKey('store-a'), '{inválido');

    expect(readFavorites(storage, 'store-a', ['product-a'])).toEqual([]);
    expect(storage.getItem(getFavoritesStorageKey('store-a'))).toBeNull();
  });

  it('continua funcional em memória quando localStorage está indisponível', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage indisponível');
      },
    });

    expect(() => useFavoritesStore.getState().setStore('store-a', ['product-a'])).not.toThrow();
    expect(useFavoritesStore.getState().toggleFavorite('product-a')).toBe(true);
    expect(useFavoritesStore.getState().productIds).toEqual(['product-a']);
  });
});
