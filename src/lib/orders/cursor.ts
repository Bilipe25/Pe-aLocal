import { ValidationError } from '@/server/errors';

const MAX_CURSOR_LENGTH = 2_048;
const MAX_ID_BYTES = 256;
const INVALID_CURSOR_MESSAGE = 'Cursor de pedidos inválido.';

export interface OrderCursor {
  createdAt: Date;
  id: string;
}

function invalidCursor(): ValidationError {
  return new ValidationError(INVALID_CURSOR_MESSAGE);
}

function isValidId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.trim() === id &&
    new TextEncoder().encode(id).byteLength <= MAX_ID_BYTES
  );
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw invalidCursor();

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function serializeCursor(createdAt: Date, id: string): string {
  return JSON.stringify({ createdAt: createdAt.toISOString(), id });
}

export function encodeOrderCursor(cursor: OrderCursor): string {
  if (
    !cursor ||
    !(cursor.createdAt instanceof Date) ||
    !Number.isFinite(cursor.createdAt.getTime()) ||
    !isValidId(cursor.id)
  ) {
    throw invalidCursor();
  }

  return encodeBase64Url(serializeCursor(cursor.createdAt, cursor.id));
}

export function decodeOrderCursor(cursor: string): OrderCursor {
  try {
    if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
      throw invalidCursor();
    }

    const decoded = decodeBase64Url(cursor);
    if (encodeBase64Url(decoded) !== cursor) throw invalidCursor();

    const payload: unknown = JSON.parse(decoded);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidCursor();

    const record = payload as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      typeof record.createdAt !== 'string' ||
      !isValidId(record.id)
    ) {
      throw invalidCursor();
    }

    const createdAt = new Date(record.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== record.createdAt) {
      throw invalidCursor();
    }

    if (serializeCursor(createdAt, record.id) !== decoded) throw invalidCursor();
    return { createdAt, id: record.id };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw invalidCursor();
  }
}
