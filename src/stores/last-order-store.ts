'use client';

import { create } from 'zustand';

export const LAST_ORDER_STORAGE_KEY_PREFIX = 'pedidolocal:last-order:';
const LAST_ORDER_STORAGE_VERSION = 1;
const PUBLIC_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LastPublicOrder {
  version: typeof LAST_ORDER_STORAGE_VERSION;
  trackingToken: string;
  storeId: string;
  storeSlug: string;
  createdAt: string;
}

interface LastOrderState {
  storeId: string | null;
  storeSlug: string | null;
  record: LastPublicOrder | null;
  setStore: (storeId: string, storeSlug: string) => void;
  registerOrder: (record: Omit<LastPublicOrder, 'version'>) => void;
  clearOrder: () => void;
}

export function getLastOrderStorageKey(storeId: string) {
  return `${LAST_ORDER_STORAGE_KEY_PREFIX}${storeId}`;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeLastOrder(storage: Storage | null, storeId: string) {
  if (!storage) return;
  try {
    storage.removeItem(getLastOrderStorageKey(storeId));
  } catch {
    // O estado em memória ainda pode ser limpo.
  }
}

function isValidRecord(
  value: unknown,
  storeId: string,
  storeSlug: string,
): value is LastPublicOrder {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === LAST_ORDER_STORAGE_VERSION &&
    record.storeId === storeId &&
    record.storeSlug === storeSlug &&
    typeof record.trackingToken === 'string' &&
    PUBLIC_TOKEN_PATTERN.test(record.trackingToken) &&
    typeof record.createdAt === 'string' &&
    Number.isFinite(Date.parse(record.createdAt))
  );
}

export function readLastOrder(
  storage: Storage | null,
  storeId: string,
  storeSlug: string,
): LastPublicOrder | null {
  if (!storage) return null;
  let raw: string | null;

  try {
    raw = storage.getItem(getLastOrderStorageKey(storeId));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidRecord(parsed, storeId, storeSlug)) {
      removeLastOrder(storage, storeId);
      return null;
    }
    return parsed;
  } catch {
    removeLastOrder(storage, storeId);
    return null;
  }
}

export function writeLastOrder(
  storage: Storage | null,
  record: Omit<LastPublicOrder, 'version'>,
): LastPublicOrder | null {
  const persisted: LastPublicOrder = {
    version: LAST_ORDER_STORAGE_VERSION,
    trackingToken: record.trackingToken,
    storeId: record.storeId,
    storeSlug: record.storeSlug,
    createdAt: record.createdAt,
  };

  if (!isValidRecord(persisted, record.storeId, record.storeSlug)) {
    return null;
  }

  if (storage) {
    try {
      storage.setItem(getLastOrderStorageKey(record.storeId), JSON.stringify(persisted));
    } catch {
      // O pedido continua acessível na sessão atual mesmo sem persistência.
    }
  }
  return persisted;
}

export const useLastOrderStore = create<LastOrderState>()((set, get) => ({
  storeId: null,
  storeSlug: null,
  record: null,

  setStore: (storeId, storeSlug) => {
    const current = get();
    if (current.storeId === storeId && current.storeSlug === storeSlug) return;
    set({
      storeId,
      storeSlug,
      record: readLastOrder(getBrowserStorage(), storeId, storeSlug),
    });
  },

  registerOrder: (record) => {
    const persisted = writeLastOrder(getBrowserStorage(), record);
    if (!persisted) return;
    set({ storeId: record.storeId, storeSlug: record.storeSlug, record: persisted });
  },

  clearOrder: () => {
    const current = get();
    if (current.storeId) removeLastOrder(getBrowserStorage(), current.storeId);
    set({ record: null });
  },
}));
