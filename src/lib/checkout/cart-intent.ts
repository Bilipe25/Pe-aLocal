import type { CartItem } from '@/stores/cart-store';

export function cartItemToCheckoutLine(item: CartItem) {
  if (item.kind === 'COMBO' && item.comboId && item.comboComponents) {
    return {
      kind: 'COMBO' as const,
      lineId: item.id,
      comboId: item.comboId,
      quantity: item.quantity,
      components: item.comboComponents.map((component) => ({
        comboItemId: component.comboItemId,
        notes: component.notes,
        optionIds: component.selectedOptions.map((option) => option.id),
      })),
    };
  }

  return {
    kind: 'PRODUCT' as const,
    lineId: item.id,
    productId: item.productId,
    quantity: item.quantity,
    notes: item.notes,
    optionIds: item.selectedOptions.map((option) => option.id),
  };
}
