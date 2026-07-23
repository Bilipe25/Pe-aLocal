import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCartStorageKey,
  LEGACY_CART_STORAGE_KEY,
  selectCartItemCount,
  selectCartStoreId,
  selectCartStoreSlug,
  selectCartTotal,
  useCartStore,
  type CartItem,
} from '@/stores/cart-store';

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

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    productId: 'product-1',
    productName: 'Produto',
    basePrice: 1000,
    quantity: 1,
    notes: '',
    selectedOptions: [],
    unitPrice: 1000,
    ...overrides,
  };
}

function itemInput(overrides: Partial<Omit<CartItem, 'id'>> = {}): Omit<CartItem, 'id'> {
  const item = cartItem(overrides);
  return {
    productId: item.productId,
    productName: item.productName,
    basePrice: item.basePrice,
    quantity: item.quantity,
    notes: item.notes,
    selectedOptions: item.selectedOptions,
    unitPrice: item.unitPrice,
  };
}

describe('carrinho por loja', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
    useCartStore.setState({ storeId: null, storeSlug: null, items: [] });
  });

  it('mantém carrinhos independentes ao alternar A → B → A', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    useCartStore.getState().addItem(itemInput({ productName: 'Produto A' }));

    useCartStore.getState().setStore('store-b', 'loja-b');
    expect(useCartStore.getState().items).toEqual([]);
    useCartStore
      .getState()
      .addItem(itemInput({ productId: 'product-2', productName: 'Produto B' }));

    useCartStore.getState().setStore('store-a', 'loja-a');
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ productName: 'Produto A' }),
    ]);

    useCartStore.getState().setStore('store-b', 'loja-b');
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ productName: 'Produto B' }),
    ]);
  });

  it('não hidrata automaticamente antes de a loja ativa ser conhecida', () => {
    storage.setItem(
      getCartStorageKey('store-a'),
      JSON.stringify({
        version: 1,
        storeId: 'store-a',
        storeSlug: 'loja-a',
        items: [cartItem()],
      }),
    );

    expect(useCartStore.getState().items).toEqual([]);
    useCartStore.getState().setStore('store-a', 'loja-a');
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('preserva o carrinho quando apenas o slug canônico da mesma loja muda', () => {
    storage.setItem(
      getCartStorageKey('store-a'),
      JSON.stringify({
        version: 1,
        storeId: 'store-a',
        storeSlug: 'slug-antigo',
        items: [cartItem()],
      }),
    );

    useCartStore.getState().setStore('store-a', 'slug-novo');

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(JSON.parse(storage.getItem(getCartStorageKey('store-a')) ?? '{}')).toMatchObject({
      storeId: 'store-a',
      storeSlug: 'slug-novo',
    });
  });

  it('migra o storage legado somente quando a loja correspondente é visitada', () => {
    storage.setItem(
      LEGACY_CART_STORAGE_KEY,
      JSON.stringify({
        state: {
          storeId: 'store-a',
          storeSlug: 'loja-a',
          items: [cartItem()],
        },
        version: 0,
      }),
    );

    useCartStore.getState().setStore('store-b', 'loja-b');
    expect(storage.getItem(LEGACY_CART_STORAGE_KEY)).not.toBeNull();

    useCartStore.getState().setStore('store-a', 'loja-a');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(storage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(getCartStorageKey('store-a'))).not.toBeNull();
  });

  it('descarta storage corrompido ou legado inválido sem quebrar a página', () => {
    storage.setItem(getCartStorageKey('store-a'), '{inválido');
    storage.setItem(LEGACY_CART_STORAGE_KEY, JSON.stringify({ state: { items: 'inválido' } }));

    expect(() => useCartStore.getState().setStore('store-a', 'loja-a')).not.toThrow();
    expect(useCartStore.getState().items).toEqual([]);
    expect(storage.getItem(getCartStorageKey('store-a'))).toBeNull();
    expect(storage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
  });

  it('continua funcional em memória quando localStorage está indisponível', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage indisponível');
      },
    });

    expect(() => useCartStore.getState().setStore('store-a', 'loja-a')).not.toThrow();
    expect(() => useCartStore.getState().addItem(itemInput())).not.toThrow();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('clearCart afeta somente a loja ativa', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    useCartStore.getState().addItem(itemInput({ productName: 'Produto A' }));
    useCartStore.getState().setStore('store-b', 'loja-b');
    useCartStore
      .getState()
      .addItem(itemInput({ productId: 'product-2', productName: 'Produto B' }));

    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);
    useCartStore.getState().setStore('store-a', 'loja-a');
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('consolida produto e customização equivalentes com optionIds em outra ordem', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    const first = useCartStore.getState().addItem(
      itemInput({
        quantity: 2,
        notes: ' sem cebola ',
        selectedOptions: [
          { id: 'option-b', name: 'B', price: 200 },
          { id: 'option-a', name: 'A', price: 100 },
        ],
      }),
    );
    const second = useCartStore.getState().addItem(
      itemInput({
        quantity: 3,
        notes: 'sem cebola',
        selectedOptions: [
          { id: 'option-a', name: 'A', price: 100 },
          { id: 'option-b', name: 'B', price: 200 },
        ],
      }),
    );

    expect(second).toMatchObject({ itemId: first.itemId, quantityAdded: 3, merged: true });
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ id: first.itemId, quantity: 5, notes: 'sem cebola' }),
    ]);
  });

  it('mantém o mesmo produto separado quando as customizações diferem', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    useCartStore
      .getState()
      .addItem(itemInput({ selectedOptions: [{ id: 'option-a', name: 'A', price: 100 }] }));
    useCartStore
      .getState()
      .addItem(itemInput({ selectedOptions: [{ id: 'option-b', name: 'B', price: 200 }] }));

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('limita a quantidade consolidada a 99 e desfaz somente o que foi adicionado', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    const first = useCartStore.getState().addItem(itemInput({ quantity: 98 }));
    const second = useCartStore.getState().addItem(itemInput({ quantity: 5 }));

    expect(second).toMatchObject({ itemId: first.itemId, quantityAdded: 1, merged: true });
    expect(useCartStore.getState().items[0].quantity).toBe(99);

    useCartStore.getState().removeQuantity(second.itemId, second.quantityAdded);
    expect(useCartStore.getState().items[0].quantity).toBe(98);
  });

  it('expõe selectors derivados estáveis para o resumo da sacola', () => {
    useCartStore.getState().setStore('store-a', 'loja-a');
    useCartStore
      .getState()
      .restoreItems([
        cartItem({ id: 'item-a', quantity: 2, unitPrice: 1_250 }),
        cartItem({ id: 'item-b', productId: 'product-b', quantity: 3, unitPrice: 500 }),
      ]);
    const state = useCartStore.getState();

    expect(selectCartStoreId(state)).toBe('store-a');
    expect(selectCartStoreSlug(state)).toBe('loja-a');
    expect(selectCartItemCount(state)).toBe(5);
    expect(selectCartTotal(state)).toBe(4_000);
  });
});
