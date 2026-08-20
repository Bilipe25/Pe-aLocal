import { describe, expect, it } from 'vitest';

import {
  DINING_TABLE_TOKEN_PATTERN,
  diningTableTokenFingerprint,
  formatDiningTableLabel,
  normalizeDiningTableLabel,
} from '@/domain/dining-tables';

describe('domínio de mesas do salão', () => {
  it('normaliza rótulos de forma estável e preserva a apresentação numerada', () => {
    expect(normalizeDiningTableLabel('  MÉSA   08  ')).toBe('mésa 08');
    expect(formatDiningTableLabel('Mesa', 8, 2)).toBe('Mesa 08');
  });

  it('aceita somente tokens públicos base64url de 256 bits', () => {
    expect(DINING_TABLE_TOKEN_PATTERN.test('a'.repeat(43))).toBe(true);
    expect(DINING_TABLE_TOKEN_PATTERN.test('a'.repeat(42))).toBe(false);
    expect(DINING_TABLE_TOKEN_PATTERN.test(`${'a'.repeat(42)}+`)).toBe(false);
  });

  it('produz fingerprints determinísticos sem reutilizar o token como chave local', () => {
    const token = 'a'.repeat(43);
    expect(diningTableTokenFingerprint(token)).toBe(diningTableTokenFingerprint(token));
    expect(diningTableTokenFingerprint(token)).not.toContain(token);
    expect(diningTableTokenFingerprint('b'.repeat(43))).not.toBe(
      diningTableTokenFingerprint(token),
    );
  });
});
