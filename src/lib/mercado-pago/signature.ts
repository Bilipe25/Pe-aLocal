import 'server-only';

const encoder = new TextEncoder();

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface MercadoPagoSignatureInput {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}

export type MercadoPagoSignatureVerification =
  | { valid: true }
  | {
      valid: false;
      reason: 'MISSING_INPUT' | 'INVALID_FORMAT' | 'EXPIRED_TIMESTAMP' | 'HMAC_MISMATCH';
    };

export async function verifyMercadoPagoSignature(
  input: MercadoPagoSignatureInput,
): Promise<MercadoPagoSignatureVerification> {
  if (!input.signature || !input.requestId || !input.dataId) {
    return { valid: false, reason: 'MISSING_INPUT' };
  }
  const parts = Object.fromEntries(
    input.signature.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  const timestamp = Number(parts.ts);
  const received = parts.v1;
  if (!Number.isFinite(timestamp) || !received || !/^[a-f0-9]{64}$/iu.test(received)) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  const timestampMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  const tolerance = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs((input.now ?? Date.now()) - timestampMs) > tolerance) {
    return { valid: false, reason: 'EXPIRED_TIMESTAMP' };
  }

  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest));
  return timingSafeEqual(hex(new Uint8Array(digest)), received.toLowerCase())
    ? { valid: true }
    : { valid: false, reason: 'HMAC_MISMATCH' };
}

export async function validateMercadoPagoSignature(
  input: MercadoPagoSignatureInput,
): Promise<boolean> {
  return (await verifyMercadoPagoSignature(input)).valid;
}
