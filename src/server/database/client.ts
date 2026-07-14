import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// =============================================================================
// Prisma Client — Singleton com Driver Adapter (Prisma 7)
// =============================================================================
// Prisma 7 requer um driver adapter para conexão direta com PostgreSQL.
// Usamos @prisma/adapter-pg com a URL do DATABASE_URL.
//
// Em desenvolvimento, o hot reload do Next.js cria novas instâncias a cada recarga.
// Sem singleton, isso esgotaria rapidamente as conexões do banco.
// =============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL não está definida. Verifique o arquivo .env.local');
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
