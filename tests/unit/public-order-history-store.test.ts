import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPublicOrderHistoryStorageKey,
  MAX_PUBLIC_ORDER_HISTORY_ITEMS,
  readPublicOrderHistory,
  usePublicOrderHistoryStore,
  writePublicOrderHistory,
} from '@/stores/public-order-history-store';

const TRACKING_TOKENS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
];

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

function record(token: string, createdAt: string) {
  return {
    trackingToken: token,
    storeId: 'store-a',
    storeSlug: 'loja-a',
    createdAt,
  };
}

describe('histórico local de pedidos públicos', () => {
  let storage: Storage;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    usePublicOrderHistoryStore.setState({ storeId: null, storeSlug: null, orders: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('persiste somente tokens e metadados mínimos, com limite por loja', () => {
    const orders = TRACKING_TOKENS.map((token, index) =>
      record(token, `2026-07-${String(26 + index).padStart(2, '0')}T12:00:00.000Z`),
    );

    writePublicOrderHistory(storage, 'store-a', 'loja-a', orders);

    const loaded = readPublicOrderHistory(storage, 'store-a', 'loja-a');
    expect(loaded).toHaveLength(MAX_PUBLIC_ORDER_HISTORY_ITEMS);
    expect(loaded[0]?.trackingToken).toBe(TRACKING_TOKENS[5]);
    expect(storage.getItem(getPublicOrderHistoryStorageKey('store-a'))).not.toContain('customer');
    expect(storage.getItem(getPublicOrderHistoryStorageKey('store-a'))).not.toContain('phone');
  });

  it('isola o histórico por loja e por slug', () => {
    writePublicOrderHistory(storage, 'store-a', 'loja-a', [
      record(TRACKING_TOKENS[0], '2026-07-31T12:00:00.000Z'),
    ]);

    expect(readPublicOrderHistory(storage, 'store-b', 'loja-b')).toEqual([]);
    expect(readPublicOrderHistory(storage, 'store-a', 'outra-loja')).toEqual([]);
    expect(readPublicOrderHistory(storage, 'store-a', 'loja-a')).toHaveLength(1);
  });

  it('remove tokens inválidos, duplicados e expirados', () => {
    writePublicOrderHistory(storage, 'store-a', 'loja-a', [
      record(TRACKING_TOKENS[0], '2026-07-31T12:00:00.000Z'),
      record(TRACKING_TOKENS[0], '2026-07-30T12:00:00.000Z'),
      record('token-invalido', '2026-07-31T12:00:00.000Z'),
      record(TRACKING_TOKENS[1], '2026-06-30T12:00:00.000Z'),
    ]);

    const loaded = readPublicOrderHistory(storage, 'store-a', 'loja-a');
    expect(loaded.map((item) => item.trackingToken)).toEqual([TRACKING_TOKENS[0]]);
  });

  it('adiciona e remove pedidos pelo store Zustand', () => {
    const store = usePublicOrderHistoryStore.getState();
    store.setStore('store-a', 'loja-a');
    store.rememberOrder(record(TRACKING_TOKENS[0], '2026-07-31T12:00:00.000Z'));

    expect(usePublicOrderHistoryStore.getState().orders).toHaveLength(1);
    expect(storage.getItem(getPublicOrderHistoryStorageKey('store-a'))).toContain(
      TRACKING_TOKENS[0],
    );

    usePublicOrderHistoryStore.getState().removeOrder(TRACKING_TOKENS[0]);
    expect(usePublicOrderHistoryStore.getState().orders).toEqual([]);
    expect(storage.getItem(getPublicOrderHistoryStorageKey('store-a'))).toBeNull();
  });
});
