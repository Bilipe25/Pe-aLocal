import type { CheckoutInput } from '@/schemas/checkout';

type CheckoutFingerprintItem = Omit<CheckoutInput['items'][number], 'notes' | 'lineId'> & {
  notes?: string;
};

type CheckoutFingerprintInputFor<T> = T extends CheckoutInput
  ? Omit<T, 'idempotencyKey' | 'notes' | 'items' | 'expectedQuoteFingerprint'> & {
      notes?: string;
      expectedQuoteFingerprint?: string;
      items: CheckoutFingerprintItem[];
    }
  : never;

export type CheckoutFingerprintInput = CheckoutFingerprintInputFor<CheckoutInput>;

export interface ResolvedCheckoutFingerprintIdentity {
  customerId: string;
  customerName: string;
  customerPhone: string;
}

export function canonicalizeCheckoutForIdempotency(
  input: CheckoutFingerprintInput,
  resolvedIdentity?: ResolvedCheckoutFingerprintIdentity | null,
) {
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
    identityMode: input.identityMode,
    customerName:
      input.identityMode === 'VISITOR'
        ? input.customerName
        : (resolvedIdentity?.customerName ?? null),
    customerPhone:
      input.identityMode === 'VISITOR'
        ? input.customerPhone
        : (resolvedIdentity?.customerPhone ?? null),
    recognizedCustomerId:
      input.identityMode === 'RECOGNIZED' ? (resolvedIdentity?.customerId ?? null) : null,
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
    payerEmail: input.payerEmail?.trim().toLowerCase() ?? null,
    changeFor: input.changeFor ?? null,
    expectedQuoteFingerprint: input.expectedQuoteFingerprint ?? null,
    notes: input.notes ?? '',
    items,
  });
}
