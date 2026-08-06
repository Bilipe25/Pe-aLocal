'use client';

import { create } from 'zustand';

import { PUBLIC_ORDER_TRACKING_RETENTION_MS } from '@/stores/last-order-store';

export const PUBLIC_ORDER_HISTORY_STORAGE_KEY_PREFIX = 'pedidolocal:order-history:';
export const PUBLIC_ORDER_HISTORY_STORAGE_VERSION = 1;
export const MAX_PUBLIC_ORDER_HISTORY_ITEMS = 5;

const PUBLIC_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;

export interface PublicOrderHistoryRecord {
  trackingToken: string;
  storeId: string;
  storeSlug: string;
  createdAt: string;
}

interface PersistedPublicOrderHistory {
  version: typeof PUBLIC_ORDER_HISTORY_STORAGE_VERSION;
  storeId: string;
  storeSlug: string;
  orders: PublicOrderHistoryRecord[];
}

interface PublicOrderHistoryState {
  storeId: string | null;
  storeSlug: string | null;
  orders: PublicOrderHistoryRecord[];
  setStore: (storeId: string, storeSlug: string) => void;
  rememberOrder: (record: PublicOrderHistoryRecord) => void;
  removeOrder: (trackingToken: string) => void;
  clearOrders: () => void;
}

export function getPublicOrderHistoryStorageKey(storeId: string) {
  return `${PUBLIC_ORDER_HISTORY_STORAGE_KEY_PREFIX}${storeId}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredHistory(storage: Storage | null, storeId: string) {
  if (!storage) return;
  try {
    storage.removeItem(getPublicOrderHistoryStorageKey(storeId));
  } catch {
    // O histórico continua disponível somente na memória quando o storage falha.
  }
}

function isValidRecord(
  value: unknown,
  storeId: string,
  storeSlug: string,
): value is PublicOrderHistoryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const createdAt =
    typeof record.createdAt === 'string' ? Date.parse(record.createdAt) : Number.NaN;
  const age = Date.now() - createdAt;

  return (
    record.storeId === storeId &&
    record.storeSlug === storeSlug &&
    typeof record.trackingToken === 'string' &&
    PUBLIC_TOKEN_PATTERN.test(record.trackingToken) &&
    Number.isFinite(createdAt) &&
    age >= -FUTURE_TOLERANCE_MS &&
    age < PUBLIC_ORDER_TRACKING_RETENTION_MS
  );
}

function normalizeOrders(
  orders: unknown[],
  storeId: string,
  storeSlug: string,
): PublicOrderHistoryRecord[] {
  const seen = new Set<string>();

  return orders
    .filter((order): order is PublicOrderHistoryRecord => isValidRecord(order, storeId, storeSlug))
    .filter((order) => {
      if (seen.has(order.trackingToken)) return false;
      seen.add(order.trackingToken);
      return true;
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, MAX_PUBLIC_ORDER_HISTORY_ITEMS);
}

export function readPublicOrderHistory(
  storage: Storage | null,
  storeId: string,
  storeSlug: string,
): PublicOrderHistoryRecord[] {
  if (!storage) return [];

  let raw: string | null;
  try {
    raw = storage.getItem(getPublicOrderHistoryStorageKey(storeId));
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !('version' in parsed) ||
      parsed.version !== PUBLIC_ORDER_HISTORY_STORAGE_VERSION ||
      !('storeId' in parsed) ||
      parsed.storeId !== storeId ||
      !('storeSlug' in parsed) ||
      !('orders' in parsed) ||
      !Array.isArray(parsed.orders)
    ) {
      removeStoredHistory(storage, storeId);
      return [];
    }

    if (parsed.storeSlug !== storeSlug) return [];

    const orders = normalizeOrders(parsed.orders, storeId, storeSlug);
    if (orders.length !== parsed.orders.length) {
      writePublicOrderHistory(storage, storeId, storeSlug, orders);
    }
    return orders;
  } catch {
    removeStoredHistory(storage, storeId);
    return [];
  }
}

export function writePublicOrderHistory(
  storage: Storage | null,
  storeId: string,
  storeSlug: string,
  orders: PublicOrderHistoryRecord[],
) {
  const normalizedOrders = normalizeOrders(orders, storeId, storeSlug);
  if (!storage) return normalizedOrders;

  try {
    if (normalizedOrders.length === 0) {
      storage.removeItem(getPublicOrderHistoryStorageKey(storeId));
      return normalizedOrders;
    }

    const persisted: PersistedPublicOrderHistory = {
      version: PUBLIC_ORDER_HISTORY_STORAGE_VERSION,
      storeId,
      storeSlug,
      orders: normalizedOrders,
    };
    storage.setItem(getPublicOrderHistoryStorageKey(storeId), JSON.stringify(persisted));
  } catch {
    // O histórico permanece disponível na memória durante a sessão atual.
  }

  return normalizedOrders;
}

function syncPublicOrderHistoryStorage(storeId: string, storeSlug: string) {
  usePublicOrderHistoryStore.setState({
    storeId,
    storeSlug,
    orders: readPublicOrderHistory(getBrowserStorage(), storeId, storeSlug),
  });
}

export function subscribeToPublicOrderHistoryStorage(storeId: string, storeSlug: string) {
  if (typeof window === 'undefined') return () => {};
  const storageKey = getPublicOrderHistoryStorageKey(storeId);
  const listener = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) return;
    syncPublicOrderHistoryStorage(storeId, storeSlug);
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

export const usePublicOrderHistoryStore = create<PublicOrderHistoryState>()((set, get) => ({
  storeId: null,
  storeSlug: null,
  orders: [],

  setStore: (storeId, storeSlug) => {
    const current = get();
    if (current.storeId === storeId && current.storeSlug === storeSlug) return;
    set({
      storeId,
      storeSlug,
      orders: readPublicOrderHistory(getBrowserStorage(), storeId, storeSlug),
    });
  },

  rememberOrder: (record) => {
    const current = get();
    if (current.storeId !== record.storeId || current.storeSlug !== record.storeSlug) return;

    const orders = writePublicOrderHistory(getBrowserStorage(), record.storeId, record.storeSlug, [
      record,
      ...current.orders,
    ]);
    set({ orders });
  },

  removeOrder: (trackingToken) => {
    const current = get();
    if (!current.storeId || !current.storeSlug) return;
    const orders = writePublicOrderHistory(
      getBrowserStorage(),
      current.storeId,
      current.storeSlug,
      current.orders.filter((order) => order.trackingToken !== trackingToken),
    );
    set({ orders });
  },

  clearOrders: () => {
    const current = get();
    if (current.storeId) removeStoredHistory(getBrowserStorage(), current.storeId);
    set({ orders: [] });
  },
}));
