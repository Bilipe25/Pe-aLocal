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

async function importKey(base64Key: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = base64ToBytes(base64Key);
  } catch {
    throw new Error('POS_DRAFT_ENCRYPTION_KEY inválida.');
  }
  if (raw.byteLength !== 32) {
    throw new Error('POS_DRAFT_ENCRYPTION_KEY deve conter 32 bytes em base64.');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function posDraftAad(input: { tenantId: string; storeId: string; draftId: string }): string {
  return ['pos-draft', input.tenantId, input.storeId, input.draftId, 'v1'].join(':');
}

export async function encryptPosDraftPayload(
  plaintext: string,
  base64Key: string,
  additionalData: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(base64Key);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(additionalData), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

export async function decryptPosDraftPayload(
  encrypted: { ciphertext: string; iv: string },
  base64Key: string,
  additionalData: string,
) {
  const key = await importKey(base64Key);
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

export function getPosDraftEncryptionKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.POS_DRAFT_ENCRYPTION_KEY?.trim();
  if (!key) throw new Error('POS_DRAFT_ENCRYPTION_KEY não configurada.');
  return key;
}
