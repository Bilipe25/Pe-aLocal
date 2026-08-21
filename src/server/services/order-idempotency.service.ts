import 'server-only';

import { createHash } from 'node:crypto';

import {
  canonicalizeCheckoutForIdempotency,
  type CheckoutFingerprintInput,
  type ResolvedDiningTableFingerprintContext,
  type ResolvedCheckoutFingerprintIdentity,
} from '@/lib/orders/order-idempotency';
import { CheckoutError } from '@/server/errors';
import type { PosOrderInput } from '@/schemas/pos';

export function createOrderFingerprint(
  input: CheckoutFingerprintInput,
  resolvedIdentity?: ResolvedCheckoutFingerprintIdentity | null,
  diningTable?: ResolvedDiningTableFingerprintContext | null,
) {
  return createHash('sha256')
    .update(canonicalizeCheckoutForIdempotency(input, resolvedIdentity, diningTable))
    .digest('hex');
}

export function createPosOrderFingerprint(
  input: PosOrderInput,
  resolved: {
    customerId: string | null;
    diningTableId: string | null;
    addressId: string | null;
  },
) {
  const canonical = {
    origin: 'POS',
    modality: input.modality,
    customer: {
      id: resolved.customerId,
      name: input.customerName || null,
      phone: input.customerPhone || null,
      save: input.saveCustomerData,
    },
    diningTableId: resolved.diningTableId,
    addressId: resolved.addressId,
    address: input.deliveryAddress ?? null,
    items: input.items.map((item) =>
      item.kind === 'COMBO'
        ? {
            kind: 'COMBO',
            lineId: item.lineId,
            comboId: item.comboId,
            quantity: item.quantity,
            components: item.components.map((component) => ({
              comboItemId: component.comboItemId,
              notes: component.notes,
              optionIds: [...component.optionIds].sort(),
            })),
          }
        : {
            kind: 'PRODUCT',
            lineId: item.lineId,
            productId: item.productId,
            quantity: item.quantity,
            notes: item.notes,
            optionIds: [...item.optionIds].sort(),
          },
    ),
    couponCode: input.couponCode ?? null,
    payment: {
      method: input.paymentMethod,
      paidNow: input.paidNow,
      changeFor: input.changeFor ?? null,
    },
    notes: input.notes,
    quoteFingerprint: input.expectedQuoteFingerprint,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function assertMatchingOrderFingerprint(
  existingFingerprint: string | null,
  requestedFingerprint: string,
) {
  if (existingFingerprint && existingFingerprint !== requestedFingerprint) {
    throw new CheckoutError(
      'CART_INVALID',
      'Esta tentativa de pedido já foi usada com outros dados.',
      409,
    );
  }
}
