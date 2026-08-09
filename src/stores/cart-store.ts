'use client';

import { create } from 'zustand';

// =============================================================================
// Cart Store v2 — persistência isolada por loja e sincronização entre abas
// =============================================================================

export const LEGACY_CART_STORAGE_KEY = 'pedidolocal-cart';
export const CART_STORAGE_KEY_PREFIX = 'pedidolocal-cart:';
export const CART_STORAGE_VERSION = 2;
export const MAX_CART_ITEM_QUANTITY = 99;

export interface SelectedOption {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  basePrice: number;
  quantity: number;
  notes: string;
  selectedOptions: SelectedOption[];
  /** Preço unitário exibido até a próxima cotação autoritativa. */
  unitPrice: number;
  imageUrl?: string | null;
  imageAssetId?: string | null;
  imageAlt?: string;
}

/** Dados de apresenta\u00e7\u00e3o obtidos da cota\u00e7\u00e3o autoritativa para carrinhos legados. */
export interface CartItemMedia {
  id: string;
  imageUrl?: string | null;
  imageAssetId?: string | null;
  imageAlt?: string | null;
}

export interface CartAddResult {
  itemId: string;
  quantityAdded: number;
  merged: boolean;
}

export type CartUpdateResult =
  | { status: 'updated'; itemId: string; merged: boolean }
  | { status: 'not-found' }
  | { status: 'quantity-limit' };

export interface CartSnapshot {
  items: CartItem[];
  couponCode: string | null;
  revision: number;
}

interface CartState {
  storeId: string | null;
  storeSlug: string | null;
  items: CartItem[];
  couponCode: string | null;
  revision: number;
  updatedAt: number;
  setStore: (storeId: string, storeSlug: string) => void;
  addItem: (item: Omit<CartItem, 'id'>) => CartAddResult;
  updateItem: (id: string, item: Omit<CartItem, 'id'>) => CartUpdateResult;
  removeItem: (id: string) => number;
  removeQuantity: (id: string, quantity: number) => number;
  updateQuantity: (id: string, quantity: number) => number;
  clearCart: () => number;
  setCouponCode: (couponCode: string | null) => number;
  enrichItemMedia: (media: CartItemMedia[]) => void;
  restoreItems: (items: CartItem[]) => number;
  getSnapshot: () => CartSnapshot;
  restoreSnapshot: (snapshot: CartSnapshot, expectedRevision: number) => boolean;
  syncExternalCart: (
    storeId: string,
    storeSlug: string,
    serialized: string | null,
    previousSerialized?: string | null,
  ) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

interface PersistedCartV2 {
  version: typeof CART_STORAGE_VERSION;
  storeId: string;
  storeSlug: string;
  items: CartItem[];
  couponCode: string | null;
  revision: number;
  updatedAt: number;
}

interface LoadedCart {
  items: CartItem[];
  couponCode: string | null;
  revision: number;
  updatedAt: number;
  requiresWrite: boolean;
}

export const selectCartStoreId = (state: CartState) => state.storeId;
export const selectCartStoreSlug = (state: CartState) => state.storeSlug;
export const selectCartCouponCode = (state: CartState) => state.couponCode;
export const selectCartRevision = (state: CartState) => state.revision;
export const selectCartItemCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);
export const selectCartTotal = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

function generateId(): string {
  return crypto.randomUUID();
}

export function getCartStorageKey(storeId: string) {
  return `${CART_STORAGE_KEY_PREFIX}${storeId}`;
}

export function createCartLineFingerprint(
  item: Pick<CartItem, 'productId' | 'selectedOptions' | 'notes'>,
) {
  return JSON.stringify({
    productId: item.productId,
    optionIds: item.selectedOptions.map((option) => option.id).sort(),
    notes: item.notes.trim(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value == null) return value as null | undefined;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  return value;
}

function normalizeCouponCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized ? normalized.slice(0, 32) : null;
}

function cloneItems(items: CartItem[]) {
  return items.map((item) => ({
    ...item,
    selectedOptions: item.selectedOptions.map((option) => ({ ...option })),
  }));
}

function normalizeCartItemInput(item: Omit<CartItem, 'id'>): Omit<CartItem, 'id'> {
  return {
    ...item,
    quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, Math.trunc(item.quantity))),
    notes: item.notes.trim(),
    selectedOptions: item.selectedOptions.map((option) => ({ ...option })),
    imageUrl: item.imageUrl ?? null,
    imageAssetId: item.imageAssetId ?? null,
    imageAlt: item.imageAlt ?? item.productName,
  };
}

function parseSelectedOption(value: unknown): SelectedOption | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.name !== 'string' ||
    !isFiniteInteger(value.price) ||
    value.price < 0
  ) {
    return null;
  }
  return { id: value.id, name: value.name, price: value.price };
}

function parseCartItem(value: unknown): CartItem | null {
  if (!isRecord(value) || !Array.isArray(value.selectedOptions)) return null;
  const selectedOptions = value.selectedOptions.map(parseSelectedOption);
  if (selectedOptions.some((option) => option === null)) return null;
  const optionIds = selectedOptions.map((option) => option!.id);
  const imageUrl = optionalString(value.imageUrl, 2_048);
  const imageAssetId = optionalString(value.imageAssetId, 200);
  const imageAlt = optionalString(value.imageAlt, 300);

  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.productId !== 'string' ||
    !value.productId ||
    typeof value.productName !== 'string' ||
    !isFiniteInteger(value.basePrice) ||
    value.basePrice < 0 ||
    !isFiniteInteger(value.unitPrice) ||
    value.unitPrice < 0 ||
    !isFiniteInteger(value.quantity) ||
    value.quantity < 1 ||
    value.quantity > MAX_CART_ITEM_QUANTITY ||
    typeof value.notes !== 'string' ||
    value.notes.length > 500 ||
    new Set(optionIds).size !== optionIds.length ||
    (value.imageUrl !== undefined && imageUrl === undefined) ||
    (value.imageAssetId !== undefined && imageAssetId === undefined) ||
    (value.imageAlt !== undefined && imageAlt === undefined)
  ) {
    return null;
  }

  return {
    id: value.id,
    productId: value.productId,
    productName: value.productName,
    basePrice: value.basePrice,
    quantity: value.quantity,
    notes: value.notes.trim(),
    selectedOptions: selectedOptions as SelectedOption[],
    unitPrice: value.unitPrice,
    imageUrl: imageUrl ?? null,
    imageAssetId: imageAssetId ?? null,
    imageAlt: imageAlt ?? value.productName,
  };
}

function parseItems(value: unknown): CartItem[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseCartItem);
  return items.some((item) => item === null) ? null : (items as CartItem[]);
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStorageItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // O carrinho continua funcional em memória em contextos restritos.
  }
}

function nextTimestamp(previous: number) {
  return Math.max(Date.now(), previous + 1);
}

function writePersistedCart(
  storage: Storage | null,
  state: Pick<
    CartState,
    'storeId' | 'storeSlug' | 'items' | 'couponCode' | 'revision' | 'updatedAt'
  >,
) {
  if (!storage || !state.storeId || !state.storeSlug) return;
  const key = getCartStorageKey(state.storeId);
  try {
    const persisted: PersistedCartV2 = {
      version: CART_STORAGE_VERSION,
      storeId: state.storeId,
      storeSlug: state.storeSlug,
      items: state.items,
      couponCode: state.couponCode,
      revision: state.revision,
      updatedAt: state.updatedAt,
    };
    storage.setItem(key, JSON.stringify(persisted));
  } catch {
    // Quota, privacidade ou indisponibilidade não podem quebrar o pedido atual.
  }
}

function parsePersistedCart(raw: string, storeId: string, storeSlug: string): LoadedCart | null {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.storeId !== storeId || typeof parsed.storeSlug !== 'string') {
    return null;
  }
  const items = parseItems(parsed.items);
  if (!items) return null;

  if (parsed.version === CART_STORAGE_VERSION) {
    if (
      !isFiniteInteger(parsed.revision) ||
      parsed.revision < 0 ||
      typeof parsed.updatedAt !== 'number' ||
      !Number.isFinite(parsed.updatedAt) ||
      (parsed.couponCode !== null && typeof parsed.couponCode !== 'string')
    ) {
      return null;
    }
    return {
      items,
      couponCode: normalizeCouponCode(parsed.couponCode as string | null),
      revision: parsed.revision,
      updatedAt: parsed.updatedAt,
      requiresWrite: parsed.storeSlug !== storeSlug,
    };
  }

  if (parsed.version === 1) {
    return {
      items,
      couponCode: null,
      revision: 1,
      updatedAt: Date.now(),
      requiresWrite: true,
    };
  }
  return null;
}

function readPersistedCart(
  storage: Storage,
  storeId: string,
  storeSlug: string,
): LoadedCart | null {
  const key = getCartStorageKey(storeId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const loaded = parsePersistedCart(raw, storeId, storeSlug);
    if (!loaded) removeStorageItem(storage, key);
    return loaded;
  } catch {
    removeStorageItem(storage, key);
    return null;
  }
}

function migrateLegacyCart(storage: Storage, storeId: string): LoadedCart | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(LEGACY_CART_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const state = isRecord(parsed) && isRecord(parsed.state) ? parsed.state : null;
    if (!state || typeof state.storeId !== 'string' || typeof state.storeSlug !== 'string') {
      removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
      return null;
    }
    const items = parseItems(state.items);
    if (!items) {
      removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
      return null;
    }
    if (state.storeId !== storeId) return null;
    removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
    return {
      items,
      couponCode: null,
      revision: 1,
      updatedAt: Date.now(),
      requiresWrite: true,
    };
  } catch {
    removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
    return null;
  }
}

function emptyLoadedCart(): LoadedCart {
  return {
    items: [],
    couponCode: null,
    revision: 0,
    updatedAt: 0,
    requiresWrite: false,
  };
}

function loadCartForStore(storeId: string, storeSlug: string) {
  const storage = getBrowserStorage();
  if (!storage) return emptyLoadedCart();
  return (
    readPersistedCart(storage, storeId, storeSlug) ??
    migrateLegacyCart(storage, storeId) ??
    emptyLoadedCart()
  );
}

export const useCartStore = create<CartState>()((set, get) => {
  const commit = (
    changes:
      | Partial<Pick<CartState, 'items' | 'couponCode'>>
      | ((state: CartState) => Partial<Pick<CartState, 'items' | 'couponCode'>> | null),
  ) => {
    const current = get();
    const resolved = typeof changes === 'function' ? changes(current) : changes;
    if (!resolved) return current.revision;
    const revision = current.revision + 1;
    const updatedAt = nextTimestamp(current.updatedAt);
    const next = { ...resolved, revision, updatedAt };
    set(next);
    writePersistedCart(getBrowserStorage(), get());
    return revision;
  };

  return {
    storeId: null,
    storeSlug: null,
    items: [],
    couponCode: null,
    revision: 0,
    updatedAt: 0,

    setStore: (storeId, storeSlug) => {
      const current = get();
      if (current.storeId === storeId && current.storeSlug === storeSlug) return;
      const loaded = loadCartForStore(storeId, storeSlug);
      set({
        storeId,
        storeSlug,
        items: loaded.items,
        couponCode: loaded.couponCode,
        revision: loaded.revision,
        updatedAt: loaded.updatedAt,
      });
      if (loaded.requiresWrite) writePersistedCart(getBrowserStorage(), get());
    },

    addItem: (item) => {
      const normalizedItem = normalizeCartItemInput(item);
      const fingerprint = createCartLineFingerprint(normalizedItem);
      const existing = get().items.find(
        (candidate) => createCartLineFingerprint(candidate) === fingerprint,
      );

      if (existing) {
        const quantityAdded = Math.min(
          normalizedItem.quantity,
          MAX_CART_ITEM_QUANTITY - existing.quantity,
        );
        if (quantityAdded > 0) {
          commit((state) => ({
            items: state.items.map((candidate) =>
              candidate.id === existing.id
                ? {
                    ...candidate,
                    ...normalizedItem,
                    id: candidate.id,
                    quantity: candidate.quantity + quantityAdded,
                  }
                : candidate,
            ),
          }));
        }
        return { itemId: existing.id, quantityAdded, merged: true };
      }

      const id = generateId();
      commit((state) => ({ items: [...state.items, { ...normalizedItem, id }] }));
      return { itemId: id, quantityAdded: normalizedItem.quantity, merged: false };
    },

    updateItem: (id, item) => {
      const current = get().items.find((candidate) => candidate.id === id);
      if (!current) return { status: 'not-found' };

      const normalizedItem = normalizeCartItemInput(item);
      const fingerprint = createCartLineFingerprint(normalizedItem);
      const equivalent = get().items.find(
        (candidate) => candidate.id !== id && createCartLineFingerprint(candidate) === fingerprint,
      );

      if (equivalent && equivalent.quantity + normalizedItem.quantity > MAX_CART_ITEM_QUANTITY) {
        return { status: 'quantity-limit' };
      }

      commit((state) => ({
        items: equivalent
          ? state.items.flatMap((candidate) => {
              if (candidate.id === id) return [];
              if (candidate.id !== equivalent.id) return [candidate];
              return [
                {
                  ...candidate,
                  ...normalizedItem,
                  id: candidate.id,
                  quantity: candidate.quantity + normalizedItem.quantity,
                },
              ];
            })
          : state.items.map((candidate) =>
              candidate.id === id ? { ...normalizedItem, id: candidate.id } : candidate,
            ),
      }));

      return {
        status: 'updated',
        itemId: equivalent?.id ?? id,
        merged: Boolean(equivalent),
      };
    },

    removeItem: (id) =>
      commit((state) => {
        if (!state.items.some((item) => item.id === id)) return null;
        const items = state.items.filter((item) => item.id !== id);
        return { items, couponCode: items.length === 0 ? null : state.couponCode };
      }),

    removeQuantity: (id, quantity) => {
      if (quantity <= 0) return get().revision;
      return commit((state) => {
        const current = state.items.find((item) => item.id === id);
        if (!current) return null;
        const items = state.items.flatMap((item) => {
          if (item.id !== id) return [item];
          const nextQuantity = item.quantity - quantity;
          return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
        });
        return { items, couponCode: items.length === 0 ? null : state.couponCode };
      });
    },

    updateQuantity: (id, quantity) => {
      if (quantity <= 0) return get().removeItem(id);
      const normalizedQuantity = Math.min(MAX_CART_ITEM_QUANTITY, Math.trunc(quantity));
      return commit((state) => {
        const current = state.items.find((item) => item.id === id);
        if (!current || current.quantity === normalizedQuantity) return null;
        return {
          items: state.items.map((item) =>
            item.id === id ? { ...item, quantity: normalizedQuantity } : item,
          ),
        };
      });
    },

    clearCart: () =>
      commit((state) =>
        state.items.length === 0 && !state.couponCode ? null : { items: [], couponCode: null },
      ),

    setCouponCode: (couponCode) => {
      const normalized = normalizeCouponCode(couponCode);
      return commit((state) =>
        state.couponCode === normalized ? null : { couponCode: normalized },
      );
    },

    enrichItemMedia: (media) => {
      if (media.length === 0) return;

      const mediaByLineId = new Map(media.map((candidate) => [candidate.id, candidate]));
      const current = get();
      let changed = false;
      const items = current.items.map((item) => {
        const candidate = mediaByLineId.get(item.id);
        if (!candidate) return item;

        // A imagem que j\u00e1 acompanhava a linha \u00e9 o snapshot preferencial. A cota\u00e7\u00e3o
        // s\u00f3 preenche carrinhos legados que ainda n\u00e3o tinham metadados de m\u00eddia.
        const imageUrl = item.imageUrl ?? candidate.imageUrl ?? null;
        const imageAssetId = item.imageAssetId ?? candidate.imageAssetId ?? null;
        const imageAlt = item.imageAlt ?? candidate.imageAlt ?? item.productName;
        if (
          imageUrl === item.imageUrl &&
          imageAssetId === item.imageAssetId &&
          imageAlt === item.imageAlt
        ) {
          return item;
        }

        changed = true;
        return { ...item, imageUrl, imageAssetId, imageAlt };
      });

      if (!changed) return;
      set({ items, updatedAt: nextTimestamp(current.updatedAt) });
      // M\u00eddia n\u00e3o muda pre\u00e7o, quantidade ou op\u00e7\u00f5es: n\u00e3o incrementamos a revis\u00e3o e
      // evitamos uma nova cota\u00e7\u00e3o desnecess\u00e1ria.
      writePersistedCart(getBrowserStorage(), get());
    },

    restoreItems: (items) => {
      const parsedItems = parseItems(items) ?? [];
      return commit({ items: parsedItems });
    },

    getSnapshot: () => ({
      items: cloneItems(get().items),
      couponCode: get().couponCode,
      revision: get().revision,
    }),

    restoreSnapshot: (snapshot, expectedRevision) => {
      const current = get();
      if (current.revision !== expectedRevision) return false;
      const items = parseItems(snapshot.items);
      if (!items) return false;
      commit({ items, couponCode: normalizeCouponCode(snapshot.couponCode) });
      return true;
    },

    syncExternalCart: (storeId, storeSlug, serialized, previousSerialized) => {
      const current = get();
      if (current.storeId !== storeId) return;
      if (!serialized) {
        if (!previousSerialized) return;
        let previous: LoadedCart | null = null;
        try {
          previous = parsePersistedCart(previousSerialized, storeId, storeSlug);
        } catch {
          return;
        }
        if (!previous || previous.updatedAt < current.updatedAt) return;
        if (current.items.length === 0 && !current.couponCode) return;
        set({
          storeSlug,
          items: [],
          couponCode: null,
          revision: current.revision + 1,
          updatedAt: nextTimestamp(Math.max(current.updatedAt, previous.updatedAt)),
        });
        return;
      }
      try {
        const loaded = parsePersistedCart(serialized, storeId, storeSlug);
        if (!loaded || loaded.updatedAt <= current.updatedAt) return;
        set({
          storeSlug,
          items: loaded.items,
          couponCode: loaded.couponCode,
          revision: loaded.revision,
          updatedAt: loaded.updatedAt,
        });
      } catch {
        // Uma gravação incompleta de outra aba é ignorada sem apagar o carrinho atual.
      }
    },

    getTotal: () => selectCartTotal(get()),
    getItemCount: () => selectCartItemCount(get()),
  };
});

export function subscribeToCartStorage(storeId: string, storeSlug: string) {
  if (typeof window === 'undefined') return () => {};
  const storageKey = getCartStorageKey(storeId);
  const listener = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage || event.key !== storageKey) return;
    useCartStore.getState().syncExternalCart(storeId, storeSlug, event.newValue, event.oldValue);
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
