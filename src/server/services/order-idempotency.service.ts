import 'server-only';

import { createHash } from 'node:crypto';

import {
  canonicalizeCheckoutForIdempotency,
  type CheckoutFingerprintInput,
  type ResolvedCheckoutFingerprintIdentity,
} from '@/lib/orders/order-idempotency';
import { CheckoutError } from '@/server/errors';

export function createOrderFingerprint(
  input: CheckoutFingerprintInput,
  resolvedIdentity?: ResolvedCheckoutFingerprintIdentity | null,
) {
  return createHash('sha256')
    .update(canonicalizeCheckoutForIdempotency(input, resolvedIdentity))
    .digest('hex');
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
