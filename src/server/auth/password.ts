import argon2 from 'argon2';

// =============================================================================
// Password Hashing — Argon2
// =============================================================================
// Wrapper sobre argon2 com configurações seguras.
// Recomendação OWASP: Argon2id com memory >= 19MB, iterations >= 2.
// =============================================================================

/**
 * Gera o hash de uma senha com Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64MB
    timeCost: 3,       // 3 iterações
    parallelism: 1,
  });
}

/**
 * Verifica uma senha contra um hash Argon2.
 * Retorna true se a senha confere.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Hash corrompido ou formato inválido
    return false;
  }
}
