'use client';

import { create } from 'zustand';

// =============================================================================
// Cart Store — persistência isolada por loja
// =============================================================================

export const LEGACY_CART_STORAGE_KEY = 'pedidolocal-cart';
export const CART_STORAGE_KEY_PREFIX = 'pedidolocal-cart:';
export const MAX_CART_ITEM_QUANTITY = 99;

export interface SelectedOption {
  id: string;
  name: string;
  price: number; // centavos
}

export interface CartItem {
  id: string; // UUID gerado no cliente
  productId: string;
  productName: string;
  basePrice: number; // centavos
  quantity: number;
  notes: string;
  selectedOptions: SelectedOption[];
  /** Preço unitário total (base + adicionais) em centavos */
  unitPrice: number;
}

export interface CartAddResult {
  itemId: string;
  quantityAdded: number;
  merged: boolean;
}

interface CartState {
  storeId: string | null;
  storeSlug: string | null;
  items: CartItem[];
  /** Ativa e restaura somente o carrinho da loja informada. */
  setStore: (storeId: string, storeSlug: string) => void;
  addItem: (item: Omit<CartItem, 'id'>) => CartAddResult;
  removeItem: (id: string) => void;
  removeQuantity: (id: string, quantity: number) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  restoreItems: (items: CartItem[]) => void;
  /** Total em centavos */
  getTotal: () => number;
  /** Quantidade total de itens */
  getItemCount: () => number;
}

interface PersistedCart {
  version: 1;
  storeId: string;
  storeSlug: string;
  items: CartItem[];
}

export const selectCartStoreId = (state: CartState) => state.storeId;
export const selectCartStoreSlug = (state: CartState) => state.storeSlug;
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
    new Set(optionIds).size !== optionIds.length
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

function writePersistedCart(
  storage: Storage | null,
  storeId: string,
  storeSlug: string,
  items: CartItem[],
) {
  if (!storage) return;
  const key = getCartStorageKey(storeId);
  try {
    if (items.length === 0) {
      storage.removeItem(key);
      return;
    }
    const persisted: PersistedCart = { version: 1, storeId, storeSlug, items };
    storage.setItem(key, JSON.stringify(persisted));
  } catch {
    // Quota, privacidade ou indisponibilidade não podem quebrar o pedido atual.
  }
}

function readPersistedCart(
  storage: Storage,
  storeId: string,
  storeSlug: string,
): CartItem[] | null {
  const key = getCartStorageKey(storeId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.storeId !== storeId ||
      typeof parsed.storeSlug !== 'string'
    ) {
      removeStorageItem(storage, key);
      return null;
    }
    const items = parseItems(parsed.items);
    if (!items) removeStorageItem(storage, key);
    if (items && parsed.storeSlug !== storeSlug) {
      writePersistedCart(storage, storeId, storeSlug, items);
    }
    return items;
  } catch {
    removeStorageItem(storage, key);
    return null;
  }
}

function migrateLegacyCart(
  storage: Storage,
  storeId: string,
  storeSlug: string,
): CartItem[] | null {
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

    // O legado só é consumido pela loja à qual ele já pertencia. Visitar outra
    // loja não apaga o carrinho antigo.
    if (state.storeId !== storeId) return null;

    writePersistedCart(storage, storeId, storeSlug, items);
    removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
    return items;
  } catch {
    removeStorageItem(storage, LEGACY_CART_STORAGE_KEY);
    return null;
  }
}

function loadItemsForStore(storeId: string, storeSlug: string) {
  const storage = getBrowserStorage();
  if (!storage) return [];
  return (
    readPersistedCart(storage, storeId, storeSlug) ??
    migrateLegacyCart(storage, storeId, storeSlug) ??
    []
  );
}

export const useCartStore = create<CartState>()((set, get) => {
  const persistCurrentItems = () => {
    const state = get();
    if (!state.storeId || !state.storeSlug) return;
    writePersistedCart(getBrowserStorage(), state.storeId, state.storeSlug, state.items);
  };

  return {
    storeId: null,
    storeSlug: null,
    items: [],

    setStore: (storeId, storeSlug) => {
      const current = get();
      if (current.storeId === storeId && current.storeSlug === storeSlug) return;
      set({ storeId, storeSlug, items: loadItemsForStore(storeId, storeSlug) });
    },

    addItem: (item) => {
      const normalizedItem = {
        ...item,
        quantity: Math.min(MAX_CART_ITEM_QUANTITY, Math.max(1, Math.trunc(item.quantity))),
        notes: item.notes.trim(),
      };
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
          set((state) => ({
            items: state.items.map((candidate) =>
              candidate.id === existing.id
                ? {
                    ...candidate,
                    productName: normalizedItem.productName,
                    basePrice: normalizedItem.basePrice,
                    selectedOptions: normalizedItem.selectedOptions,
                    unitPrice: normalizedItem.unitPrice,
                    quantity: candidate.quantity + quantityAdded,
                  }
                : candidate,
            ),
          }));
          persistCurrentItems();
        }
        return { itemId: existing.id, quantityAdded, merged: true };
      }

      const id = generateId();
      set((state) => ({ items: [...state.items, { ...normalizedItem, id }] }));
      persistCurrentItems();
      return { itemId: id, quantityAdded: normalizedItem.quantity, merged: false };
    },

    removeItem: (id) => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
      persistCurrentItems();
    },

    removeQuantity: (id, quantity) => {
      if (quantity <= 0) return;
      set((state) => ({
        items: state.items.flatMap((item) => {
          if (item.id !== id) return [item];
          const nextQuantity = item.quantity - quantity;
          return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
        }),
      }));
      persistCurrentItems();
    },

    updateQuantity: (id, quantity) => {
      if (quantity <= 0) {
        get().removeItem(id);
        return;
      }
      const normalizedQuantity = Math.min(MAX_CART_ITEM_QUANTITY, Math.trunc(quantity));
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, quantity: normalizedQuantity } : item,
        ),
      }));
      persistCurrentItems();
    },

    clearCart: () => {
      set({ items: [] });
      persistCurrentItems();
    },

    restoreItems: (items) => {
      const parsedItems = parseItems(items) ?? [];
      set({ items: parsedItems });
      persistCurrentItems();
    },

    getTotal: () => selectCartTotal(get()),

    getItemCount: () => selectCartItemCount(get()),
  };
});
