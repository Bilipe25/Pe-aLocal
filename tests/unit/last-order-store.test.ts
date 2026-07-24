import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLastOrderStorageKey,
  readLastOrder,
  useLastOrderStore,
  writeLastOrder,
} from '@/stores/last-order-store';

const TRACKING_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

describe('último pedido público por estabelecimento', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    useLastOrderStore.setState({
      storeId: null,
      storeSlug: null,
      record: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persiste somente token e metadados públicos mínimos', () => {
    const record = writeLastOrder(storage, {
      trackingToken: TRACKING_TOKEN,
      storeId: 'store-a',
      storeSlug: 'loja-a',
      createdAt: '2026-07-24T12:00:00.000Z',
    });

    expect(record).toEqual({
      version: 1,
      trackingToken: TRACKING_TOKEN,
      storeId: 'store-a',
      storeSlug: 'loja-a',
      createdAt: '2026-07-24T12:00:00.000Z',
    });
    expect(storage.getItem(getLastOrderStorageKey('store-a'))).not.toContain('customer');
  });

  it('isola pedidos de lojas diferentes', () => {
    writeLastOrder(storage, {
      trackingToken: TRACKING_TOKEN,
      storeId: 'store-a',
      storeSlug: 'loja-a',
      createdAt: '2026-07-24T12:00:00.000Z',
    });

    expect(readLastOrder(storage, 'store-b', 'loja-b')).toBeNull();
    expect(readLastOrder(storage, 'store-a', 'loja-a')?.trackingToken).toBe(TRACKING_TOKEN);
  });

  it('remove registros corrompidos ou incompatíveis', () => {
    storage.setItem(getLastOrderStorageKey('store-a'), '{inválido');
    expect(readLastOrder(storage, 'store-a', 'loja-a')).toBeNull();
    expect(storage.getItem(getLastOrderStorageKey('store-a'))).toBeNull();

    storage.setItem(
      getLastOrderStorageKey('store-a'),
      JSON.stringify({
        version: 1,
        trackingToken: 'token-interno-inválido',
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: '2026-07-24T12:00:00.000Z',
      }),
    );
    expect(readLastOrder(storage, 'store-a', 'loja-a')).toBeNull();
    expect(storage.getItem(getLastOrderStorageKey('store-a'))).toBeNull();
  });

  it('mantém o pedido na sessão quando localStorage está indisponível', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage indisponível');
      },
    });

    expect(() =>
      useLastOrderStore.getState().registerOrder({
        trackingToken: TRACKING_TOKEN,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        createdAt: '2026-07-24T12:00:00.000Z',
      }),
    ).not.toThrow();
    expect(useLastOrderStore.getState().record?.trackingToken).toBe(TRACKING_TOKEN);
  });
});
