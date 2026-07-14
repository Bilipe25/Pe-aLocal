import { cookies } from 'next/headers';
import crypto from 'node:crypto';

// =============================================================================
// Sessão — Gerenciamento de cookies e tokens
// =============================================================================

const SESSION_COOKIE_NAME = 'pedidolocal_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 dias em segundos

/**
 * Gera um token de sessão criptograficamente seguro (256 bits).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calcula a data de expiração da sessão.
 */
export function getSessionExpiration(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE * 1000);
}

/**
 * Define o cookie de sessão no navegador.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Recupera o token de sessão do cookie.
 * Retorna null se não houver cookie.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Remove o cookie de sessão.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE };
