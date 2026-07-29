import 'server-only';

import { formatZipCode, normalizePhone } from '@/lib/brazil';

const NAME_CONNECTORS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const STREET_PREFIXES = new Set([
  'alameda',
  'avenida',
  'estrada',
  'largo',
  'praça',
  'rodovia',
  'rua',
  'travessa',
  'viela',
]);

export interface CustomerAddressValue {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode?: string | null;
  reference?: string | null;
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function truncateText(value: string, maxCharacters: number) {
  const characters = Array.from(value);
  if (characters.length <= maxCharacters) return value;
  return `${characters.slice(0, Math.max(1, maxCharacters - 1)).join('')}…`;
}

function normalizeForComparison(value: string) {
  return collapseSpaces(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function maskToken(value: string) {
  const first = Array.from(value)[0];
  return first ? `${first}***` : '***';
}

export function normalizeCustomerName(value: string) {
  return normalizeForComparison(value);
}

export function customerNamesMatch(savedName: string, providedName: string) {
  return normalizeCustomerName(savedName) === normalizeCustomerName(providedName);
}

export function maskCustomerName(value: string) {
  const parts = collapseSpaces(value).split(' ').filter(Boolean);
  if (parts.length === 0) return '***';
  if (parts.length === 1) return maskToken(parts[0]);

  return truncateText(
    parts
      .map((part, index) => {
        if (index === 0) return part;
        return NAME_CONNECTORS.has(normalizeForComparison(part))
          ? part.toLocaleLowerCase('pt-BR')
          : maskToken(part);
      })
      .join(' '),
    100,
  );
}

export function maskPhone(value: string) {
  const normalized = normalizePhone(value);
  const local = normalized.startsWith('55') ? normalized.slice(2) : normalized;
  if (!/^\d{10,11}$/.test(local)) return '(**) *****-****';

  return `(${local.slice(0, 2)}) *****-**${local.slice(-2)}`;
}

function maskStreet(value: string) {
  return truncateText(
    collapseSpaces(value)
      .split(' ')
      .filter(Boolean)
      .map((part, index) => {
        const normalized = normalizeForComparison(part);
        if (index === 0 && STREET_PREFIXES.has(normalized)) return part;
        if (NAME_CONNECTORS.has(normalized)) return part.toLocaleLowerCase('pt-BR');
        return maskToken(part);
      })
      .join(' '),
    80,
  );
}

export function maskSavedAddress(address: CustomerAddressValue) {
  return `${maskStreet(address.street)}, nº *** — ${truncateText(collapseSpaces(address.neighborhood), 60)}`;
}

export function formatAddressForCustomerPreview(address: CustomerAddressValue) {
  return maskSavedAddress(address);
}

export function formatAddressForStore(address: CustomerAddressValue) {
  const postalCode = address.zipCode?.replace(/\D/g, '');
  return [
    `${collapseSpaces(address.street)}, ${collapseSpaces(address.number)}`,
    address.complement ? collapseSpaces(address.complement) : null,
    collapseSpaces(address.neighborhood),
    `${collapseSpaces(address.city)} - ${collapseSpaces(address.state).toUpperCase()}`,
    postalCode ? `CEP ${formatZipCode(postalCode)}` : null,
    address.reference ? `Referência: ${collapseSpaces(address.reference)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

/**
 * Identifica o mesmo destino sem incorporar a referência de entrega, que pode
 * mudar entre pedidos. O digest nunca é exposto ao navegador nem usado como
 * prova de identidade.
 */
export async function createCustomerAddressFingerprint(address: CustomerAddressValue) {
  const canonical = [
    normalizeForComparison(address.street),
    normalizeForComparison(address.number),
    normalizeForComparison(address.complement ?? ''),
    normalizeForComparison(address.neighborhood),
    normalizeForComparison(address.city),
    normalizeForComparison(address.state),
    address.zipCode?.replace(/\D/g, '') ?? '',
  ].join('\u001f');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
