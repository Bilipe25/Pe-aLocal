import type { CheckoutInput } from '@/schemas/checkout';

type CheckoutFingerprintItem = Omit<CheckoutInput['items'][number], 'notes'> & {
  notes?: string;
};

export type CheckoutFingerprintInput = Omit<CheckoutInput, 'idempotencyKey' | 'notes' | 'items'> & {
  notes?: string;
  items: CheckoutFingerprintItem[];
};

export function canonicalizeCheckoutForIdempotency(input: CheckoutFingerprintInput) {
  const items = input.items
    .map((item) => JSON.stringify({
      productId: item.productId,
      quantity: item.quantity,
      notes: item.notes ?? '',
      optionIds: [...item.optionIds].sort(),
    }))
    .sort();

  return JSON.stringify({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    modality: input.modality,
    deliveryZoneId: input.deliveryZoneId ?? null,
    deliveryAddress: input.deliveryAddress ?? null,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    notes: input.notes ?? '',
    items,
  });
}
