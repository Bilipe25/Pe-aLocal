import 'server-only';

import { createHash } from 'node:crypto';

import { canonicalizeCheckoutForIdempotency } from '@/lib/orders/order-idempotency';
import type { CheckoutInput } from '@/schemas/checkout';
import { ConflictError } from '@/server/errors';

export function createOrderFingerprint(input: CheckoutInput) {
  return createHash('sha256')
    .update(canonicalizeCheckoutForIdempotency(input))
    .digest('hex');
}

export function assertMatchingOrderFingerprint(
  existingFingerprint: string | null,
  requestedFingerprint: string,
) {
  if (existingFingerprint && existingFingerprint !== requestedFingerprint) {
    throw new ConflictError('Esta tentativa de pedido já foi usada com outros dados.');
  }
}
