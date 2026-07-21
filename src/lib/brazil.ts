const BRAZILIAN_STATES = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);

export type PixKeyKind = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export function normalizePhone(value: string) {
  const normalized = digits(value);
  if (normalized.length === 10 || normalized.length === 11) return `55${normalized}`;
  return normalized;
}

export function validateBrazilianPhone(value: string) {
  const normalized = normalizePhone(value);
  if (!/^55\d{10,11}$/.test(normalized)) return false;
  const local = normalized.slice(2);
  return /^[1-9]{2}[2-9]\d{7,8}$/.test(local);
}

export function formatPhone(value: string) {
  const normalized = normalizePhone(value);
  if (!/^55\d{10,11}$/.test(normalized)) return value;
  const local = normalized.slice(2);
  const areaCode = local.slice(0, 2);
  const number = local.slice(2);
  return number.length === 9
    ? `(${areaCode}) ${number.slice(0, 5)}-${number.slice(5)}`
    : `(${areaCode}) ${number.slice(0, 4)}-${number.slice(4)}`;
}

export function normalizeZipCode(value: string) {
  return digits(value);
}

export function formatZipCode(value: string) {
  const normalized = normalizeZipCode(value);
  return normalized.length === 8 ? `${normalized.slice(0, 5)}-${normalized.slice(5)}` : value;
}

export function normalizeState(value: string) {
  return value.trim().toUpperCase();
}

export function validateBrazilianState(value: string) {
  return BRAZILIAN_STATES.has(normalizeState(value));
}

export function normalizeCpf(value: string) {
  return digits(value);
}

export function validateCpf(value: string) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const total = cpf
      .slice(0, length)
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * (length + 1 - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function normalizeCnpj(value: string) {
  return digits(value);
}

export function validateCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (base: string, weights: number[]) => {
    const total = base
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(
    `${cnpj.slice(0, 12)}${first}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

function normalizeEmail(value: string) {
  const trimmed = value.trim();
  const separator = trimmed.lastIndexOf('@');
  if (separator < 1) return trimmed;
  return `${trimmed.slice(0, separator)}@${trimmed.slice(separator + 1).toLowerCase()}`;
}

export function normalizePixKey(type: PixKeyKind, value: string) {
  if (type === 'CPF') return normalizeCpf(value);
  if (type === 'CNPJ') return normalizeCnpj(value);
  if (type === 'PHONE') return `+${normalizePhone(value)}`;
  if (type === 'EMAIL') return normalizeEmail(value);
  return value.trim().toLowerCase();
}

export function validatePixKey(type: PixKeyKind, value: string) {
  const normalized = normalizePixKey(type, value);
  if (type === 'CPF') return validateCpf(normalized);
  if (type === 'CNPJ') return validateCnpj(normalized);
  if (type === 'PHONE')
    return /^\+55\d{10,11}$/.test(normalized) && validateBrazilianPhone(normalized);
  if (type === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized,
  );
}

export function maskPixKey(type: PixKeyKind | null, value: string | null) {
  if (!type || !value) return '';
  const normalized = normalizePixKey(type, value);
  if (type === 'CPF') return `***.***.***-${normalized.slice(-2)}`;
  if (type === 'CNPJ') return `**.***.***/****-${normalized.slice(-2)}`;
  if (type === 'PHONE') return `+55 (***) *****-${normalized.slice(-4)}`;
  if (type === 'EMAIL') {
    const [local = '', domain = ''] = normalized.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

export function normalizeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
