'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// Cart Store — Zustand com persistência em localStorage
// =============================================================================

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

interface CartState {
  storeId: string | null;
  storeSlug: string | null;
  items: CartItem[];
  /** Define a loja do carrinho. Limpa itens se mudar de loja. */
  setStore: (storeId: string, storeSlug: string) => void;
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  /** Total em centavos */
  getTotal: () => number;
  /** Quantidade total de itens */
  getItemCount: () => number;
}

function generateId(): string {
  return crypto.randomUUID();
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      storeSlug: null,
      items: [],

      setStore: (storeId, storeSlug) => {
        const current = get();
        if (current.storeId !== storeId) {
          set({ storeId, storeSlug, items: [] });
        }
      },

      addItem: (item) => {
        set((state) => ({
          items: [...state.items, { ...item, id: generateId() }],
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));
      },

      updateQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => {
        return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'pedidolocal-cart',
    },
  ),
);
