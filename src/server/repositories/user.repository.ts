import { db } from '@/server/database/client';

// =============================================================================
// User Repository
// =============================================================================

/**
 * Busca um usuário pelo e-mail.
 * Retorna null se não encontrar (sem revelar se o e-mail existe).
 */
export async function findUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}

/**
 * Busca um usuário pelo ID.
 */
export async function findUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });
}

/**
 * Cria um novo usuário.
 */
export async function createUser(data: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  return db.user.create({
    data: {
      email: data.email.toLowerCase().trim(),
      name: data.name.trim(),
      passwordHash: data.passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
    },
  });
}

/**
 * Verifica se um e-mail já está em uso.
 */
export async function emailExists(email: string): Promise<boolean> {
  const count = await db.user.count({
    where: { email: email.toLowerCase().trim() },
  });
  return count > 0;
}
