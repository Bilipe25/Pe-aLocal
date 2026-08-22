import type { CheckoutInput, DineInCheckoutInput } from '@/schemas/checkout';

export type CheckoutFingerprintItem<T = CheckoutInput['items'][number]> =
  T extends CheckoutInput['items'][number]
    ? Omit<T, 'notes' | 'lineId'> & { notes?: string }
    : never;

type CheckoutFingerprintInputFor<T extends CheckoutInput | DineInCheckoutInput> = T extends
  CheckoutInput | DineInCheckoutInput
  ? Omit<T, 'idempotencyKey' | 'notes' | 'items' | 'expectedQuoteFingerprint'> & {
      notes?: string;
      expectedQuoteFingerprint?: string;
      items: CheckoutFingerprintItem[];
    }
  : never;

export type CheckoutFingerprintInput =
  CheckoutFingerprintInputFor<CheckoutInput> | CheckoutFingerprintInputFor<DineInCheckoutInput>;

export interface ResolvedCheckoutFingerprintIdentity {
  customerId: string;
  customerName: string;
  customerPhone: string;
}

export interface ResolvedDiningTableFingerprintContext {
  diningTableId: string;
  diningTableVersion: number;
}

export function canonicalizeCheckoutForIdempotency(
  input: CheckoutFingerprintInput,
  resolvedIdentity?: ResolvedCheckoutFingerprintIdentity | null,
  diningTable?: ResolvedDiningTableFingerprintContext | null,
) {
  const items = input.items
    .map((item) =>
      JSON.stringify(
        item.kind === 'COMBO'
          ? {
              kind: 'COMBO',
              comboId: item.comboId,
              quantity: item.quantity,
              components: item.components
                .map((component) => ({
                  comboItemId: component.comboItemId,
                  notes: component.notes ?? '',
                  optionIds: [...component.optionIds].sort(),
                }))
                .sort((left, right) => left.comboItemId.localeCompare(right.comboItemId)),
            }
          : {
              kind: 'PRODUCT',
              productId: item.productId,
              quantity: item.quantity,
              notes: item.notes ?? '',
              optionIds: [...item.optionIds].sort(),
            },
      ),
    )
    .sort();

  const standard = 'identityMode' in input ? input : null;
  return JSON.stringify({
    identityMode: standard?.identityMode ?? 'DINE_IN_VISITOR',
    customerName: standard
      ? standard.identityMode === 'VISITOR'
        ? standard.customerName
        : (resolvedIdentity?.customerName ?? null)
      : 'customerName' in input
        ? input.customerName
        : null,
    customerPhone: standard
      ? standard.identityMode === 'VISITOR'
        ? standard.customerPhone
        : (resolvedIdentity?.customerPhone ?? null)
      : null,
    recognizedCustomerId:
      standard?.identityMode === 'RECOGNIZED' ? (resolvedIdentity?.customerId ?? null) : null,
    modality: standard?.modality ?? 'DINE_IN',
    diningTableId: diningTable?.diningTableId ?? null,
    diningTableVersion: diningTable?.diningTableVersion ?? null,
    deliveryZoneId: standard?.deliveryZoneId ?? null,
    deliveryPostalCode: standard?.deliveryPostalCode ?? null,
    deliveryAddress: standard?.deliveryAddress ?? null,
    savedAddressReference: standard?.savedAddressReference ?? null,
    saveCustomerData: standard?.saveCustomerData ?? false,
    addressLabel: standard?.addressLabel ?? null,
    setAddressAsDefault: standard?.setAddressAsDefault ?? false,
    couponCode: input.couponCode ?? null,
    paymentMethod: input.paymentMethod,
    payerEmail: input.payerEmail?.trim().toLowerCase() ?? null,
    changeFor: standard?.changeFor ?? null,
    expectedQuoteFingerprint: input.expectedQuoteFingerprint ?? null,
    notes: input.notes ?? '',
    items,
  });
}
