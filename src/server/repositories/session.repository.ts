import { db } from '@/server/database/client';

// =============================================================================
// Session Repository
// =============================================================================

/**
 * Cria uma nova sessão no banco.
 */
export async function createSession(data: {
  userId: string;
  token: string;
  expiresAt: Date;
}) {
  return db.session.create({
    data: {
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
    },
  });
}

/**
 * Busca uma sessão válida pelo token.
 * Retorna null se não existir ou estiver expirada.
 */
export async function findValidSession(token: string) {
  return db.session.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Deleta uma sessão pelo token (logout).
 */
export async function deleteSessionByToken(token: string) {
  return db.session.deleteMany({
    where: { token },
  });
}

/**
 * Deleta todas as sessões de um usuário (logout em todos os dispositivos).
 */
export async function deleteAllUserSessions(userId: string) {
  return db.session.deleteMany({
    where: { userId },
  });
}

/**
 * Deleta sessões expiradas (limpeza periódica).
 */
export async function deleteExpiredSessions() {
  return db.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
