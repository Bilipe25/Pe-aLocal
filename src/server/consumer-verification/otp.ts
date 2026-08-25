import 'server-only';

const OTP_SPACE = 1_000_000;
const UINT32_SPACE = 0x1_0000_0000;
const MAX_UNBIASED_UINT32 = UINT32_SPACE - (UINT32_SPACE % OTP_SPACE);
const encoder = new TextEncoder();

export const CONSUMER_OTP_LENGTH = 6;

export function generateConsumerOtp() {
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while (random[0] >= MAX_UNBIASED_UINT32);
  return String(random[0] % OTP_SPACE).padStart(CONSUMER_OTP_LENGTH, '0');
}

async function importOtpKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function otpPayload(challengeToken: string, code: string) {
  return encoder.encode(`pedidolocal-consumer-otp-v1\0${challengeToken}\0${code}`);
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]{64}$/u.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function hashConsumerOtp(input: {
  challengeToken: string;
  code: string;
  secret: string;
}) {
  const key = await importOtpKey(input.secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    otpPayload(input.challengeToken, input.code),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function verifyConsumerOtpHash(input: {
  challengeToken: string;
  code: string;
  secret: string;
  otpHash: string;
}) {
  const signature = hexToBytes(input.otpHash);
  if (!signature) return false;
  const key = await importOtpKey(input.secret);
  return crypto.subtle.verify('HMAC', key, signature, otpPayload(input.challengeToken, input.code));
}
