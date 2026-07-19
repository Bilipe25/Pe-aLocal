import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('zustand/middleware', () => ({ persist: (initializer: unknown) => initializer }));

import { useCartStore } from '@/stores/cart-store';

const item = {
  id: 'item-1',
  productId: 'product-1',
  productName: 'Produto',
  basePrice: 1000,
  quantity: 1,
  notes: '',
  selectedOptions: [],
  unitPrice: 1000,
};

describe('carrinho por loja', () => {
  beforeEach(() => {
    useCartStore.setState({ storeId: null, storeSlug: null, items: [] });
  });

  it('preserva itens na mesma loja e limpa ao trocar de estabelecimento', () => {
    useCartStore.setState({ storeId: 'store-1', storeSlug: 'loja-1', items: [item] });

    useCartStore.getState().setStore('store-1', 'loja-1');
    expect(useCartStore.getState().items).toHaveLength(1);

    useCartStore.getState().setStore('store-2', 'loja-2');
    expect(useCartStore.getState()).toMatchObject({
      storeId: 'store-2',
      storeSlug: 'loja-2',
      items: [],
    });
  });

  it('retorna o id ao adicionar e restaura um snapshot limpo', () => {
    const addedId = useCartStore.getState().addItem({
      productId: item.productId,
      productName: item.productName,
      basePrice: item.basePrice,
      quantity: item.quantity,
      notes: item.notes,
      selectedOptions: item.selectedOptions,
      unitPrice: item.unitPrice,
    });
    const snapshot = useCartStore.getState().items;

    expect(addedId).toEqual(expect.any(String));
    expect(snapshot).toEqual([expect.objectContaining({ id: addedId, productId: 'product-1' })]);

    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);

    useCartStore.getState().restoreItems(snapshot);
    expect(useCartStore.getState().items).toEqual(snapshot);
  });
});
