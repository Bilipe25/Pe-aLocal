import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina classes CSS condicionalmente com merge de Tailwind.
 * Usado por todos os componentes shadcn/ui.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata um valor em reais (BRL).
 *
 * @example
 * formatCurrency(4590) // "R$ 45,90"
 */
export function formatCurrency(valueInCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valueInCents / 100);
}

/**
 * Normaliza uma string para uso como slug.
 *
 * @example
 * slugify("Burger do Zé") // "burger-do-ze"
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Palavras reservadas que não podem ser usadas como slug de loja.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'dashboard',
  'login',
  'logout',
  'entrar',
  'cadastro',
  'conta',
  'pedido',
  'pedidos',
  'checkout',
  'configuracoes',
  'suporte',
  'health',
  'auth',
  'register',
  'signup',
  'signin',
  'settings',
  'profile',
  'about',
  'terms',
  'privacy',
  'help',
]);

/**
 * Verifica se um slug é válido (não reservado e formato correto).
 */
export function isValidSlug(slug: string): boolean {
  if (RESERVED_SLUGS.has(slug)) return false;
  if (slug.length < 3 || slug.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug);
}

/**
 * Gera um número de pedido amigável.
 * Formato: 4 dígitos, reinicia por loja.
 */
export function formatOrderNumber(num: number): string {
  return String(num).padStart(4, '0');
}

/**
 * Aguarda um número de milissegundos (útil em dev/tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
