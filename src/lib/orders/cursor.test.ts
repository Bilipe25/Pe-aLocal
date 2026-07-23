import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/server/errors';
import { decodeOrderCursor, encodeOrderCursor } from './cursor';

function rawBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('order cursor', () => {
  it('faz roundtrip opaco de createdAt e id', () => {
    const createdAt = new Date('2024-11-03T05:30:12.345Z');
    const encoded = encodeOrderCursor({ createdAt, id: 'cm-order_123' });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(createdAt.toISOString());
    expect(decodeOrderCursor(encoded)).toEqual({ createdAt, id: 'cm-order_123' });
  });

  it.each([
    '',
    '***',
    'a',
    rawBase64Url('not json'),
    rawBase64Url(JSON.stringify({ createdAt: '2024-01-01', id: 'order-1' })),
    rawBase64Url(JSON.stringify({ createdAt: '2024-01-01T00:00:00.000Z', id: '' })),
    rawBase64Url(
      JSON.stringify({ createdAt: '2024-01-01T00:00:00.000Z', id: 'order-1', extra: true }),
    ),
    rawBase64Url('{"id":"order-1","createdAt":"2024-01-01T00:00:00.000Z"}'),
    'a'.repeat(2_049),
  ])('rejeita cursor inválido com ValidationError', (cursor) => {
    expect(() => decodeOrderCursor(cursor)).toThrow(ValidationError);
  });

  it('rejeita entradas inválidas no encoder', () => {
    expect(() => encodeOrderCursor({ createdAt: new Date('invalid'), id: 'order-1' })).toThrow(
      ValidationError,
    );
    expect(() => encodeOrderCursor({ createdAt: new Date(), id: ' ' })).toThrow(ValidationError);
    expect(() => encodeOrderCursor({ createdAt: new Date(), id: 'x'.repeat(257) })).toThrow(
      ValidationError,
    );
  });
});
