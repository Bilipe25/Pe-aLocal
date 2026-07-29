import type { CheckoutInput } from '@/schemas/checkout';

type CheckoutFingerprintItem = Omit<CheckoutInput['items'][number], 'notes' | 'lineId'> & {
  notes?: string;
};

export type CheckoutFingerprintInput = Omit<
  CheckoutInput,
  'idempotencyKey' | 'notes' | 'items' | 'expectedQuoteFingerprint'
> & {
  notes?: string;
  expectedQuoteFingerprint?: string;
  items: CheckoutFingerprintItem[];
};

export function canonicalizeCheckoutForIdempotency(input: CheckoutFingerprintInput) {
  const items = input.items
    .map((item) =>
      JSON.stringify({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes ?? '',
        optionIds: [...item.optionIds].sort(),
      }),
    )
    .sort();

  return JSON.stringify({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    modality: input.modality,
    deliveryZoneId: input.deliveryZoneId ?? null,
    deliveryPostalCode: input.deliveryPostalCode ?? null,
    deliveryAddress: input.deliveryAddress ?? null,
    savedAddressReference: input.savedAddressReference ?? null,
    saveCustomerData: input.saveCustomerData,
    addressLabel: input.addressLabel,
    setAddressAsDefault: input.setAddressAsDefault,
    couponCode: input.couponCode ?? null,
    paymentMethod: input.paymentMethod,
    changeFor: input.changeFor ?? null,
    expectedQuoteFingerprint: input.expectedQuoteFingerprint ?? null,
    notes: input.notes ?? '',
    items,
  });
}
