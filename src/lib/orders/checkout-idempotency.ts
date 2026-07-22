import {
  canonicalizeCheckoutForIdempotency,
  type CheckoutFingerprintInput,
} from './order-idempotency';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

export interface CheckoutIdempotencyRecord {
  key: string;
  fingerprint: string;
}

async function fingerprintPayload(payload: CheckoutFingerprintInput) {
  const bytes = new TextEncoder().encode(canonicalizeCheckoutForIdempotency(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function resolveCheckoutIdempotency(
  payload: CheckoutFingerprintInput,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  storageKey: string,
  current: CheckoutIdempotencyRecord | null,
): Promise<CheckoutIdempotencyRecord> {
  const fingerprint = await fingerprintPayload(payload);
  if (current?.fingerprint === fingerprint) return current;

  try {
    const raw = storage?.getItem(storageKey);
    const stored = raw ? JSON.parse(raw) as Partial<CheckoutIdempotencyRecord> : null;
    if (
      stored &&
      typeof stored.key === 'string' &&
      UUID_PATTERN.test(stored.key) &&
      typeof stored.fingerprint === 'string' &&
      FINGERPRINT_PATTERN.test(stored.fingerprint) &&
      stored.fingerprint === fingerprint
    ) {
      return { key: stored.key, fingerprint };
    }
  } catch {
    // Invalid or unavailable storage falls back to the in-memory record below.
  }

  const record = { key: crypto.randomUUID(), fingerprint };
  try {
    storage?.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Persistence is optional in restricted browsing contexts.
  }
  return record;
}

export function clearCheckoutIdempotency(
  storage: Pick<Storage, 'removeItem'> | null,
  storageKey: string,
) {
  try {
    storage?.removeItem(storageKey);
  } catch {
    // Persistence is optional in restricted browsing contexts.
  }
}
