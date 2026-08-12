import 'server-only';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  return bytesToBase64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))),
  );
}

async function importCredentialKey(base64Key: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = base64ToBytes(base64Key);
  } catch {
    throw new Error('A chave de criptografia do Mercado Pago é inválida.');
  }
  if (raw.byteLength !== 32) {
    throw new Error('A chave de criptografia do Mercado Pago deve ter 32 bytes em base64.');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  version: 1;
}

export async function encryptCredential(
  plaintext: string,
  base64Key: string,
  additionalData: string,
): Promise<EncryptedCredential> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importCredentialKey(base64Key);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(additionalData), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    version: 1,
  };
}

export async function decryptCredential(
  encrypted: Pick<EncryptedCredential, 'ciphertext' | 'iv'>,
  base64Key: string,
  additionalData: string,
): Promise<string> {
  const key = await importCredentialKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(encrypted.iv),
      additionalData: encoder.encode(additionalData),
      tagLength: 128,
    },
    key,
    base64ToBytes(encrypted.ciphertext),
  );
  return decoder.decode(plaintext);
}

export function credentialAad(input: {
  tenantId: string;
  storeId: string;
  provider: 'MERCADO_PAGO';
  kind: 'access_token' | 'refresh_token' | 'pkce_verifier' | 'payer_email';
  version?: number;
}): string {
  return [input.tenantId, input.storeId, input.provider, input.kind, input.version ?? 1].join(':');
}
