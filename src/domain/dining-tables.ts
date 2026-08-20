export const DINING_TABLE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeDiningTableLabel(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function formatDiningTableLabel(prefix: string, number: number, width = 2) {
  return `${prefix.trim()} ${String(number).padStart(width, '0')}`;
}

export function diningTableTokenFingerprint(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
