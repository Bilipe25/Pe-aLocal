import { cache } from 'react';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function getConnectionString(): string {
  try {
    const { env } = getCloudflareContext();
    if (env.HYPERDRIVE?.connectionString) {
      return env.HYPERDRIVE.connectionString;
    }
  } catch {
    // `next dev`, Prisma CLI e testes Node não possuem contexto Workers.
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Binding HYPERDRIVE indisponível e DATABASE_URL não definida para o runtime local.',
    );
  }

  return connectionString;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getConnectionString(), maxUses: 1 });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/**
 * Retorna um Prisma Client associado à requisição/renderização atual.
 * O cache do React é request-scoped no servidor do Next.js; não existe Pool
 * ou Prisma Client mutável em escopo global entre requisições do Worker.
 */
export const getDb = cache(createPrismaClient);

export type DatabaseClient = ReturnType<typeof getDb>;
