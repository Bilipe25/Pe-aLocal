import { cache } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createDatabaseClient } from './factory';

interface HyperdriveBindingLike {
  connectionString?: string;
}

function readHyperdriveBinding(env: CloudflareEnv, binding: 'HYPERDRIVE' | 'HYPERDRIVE_FRESH') {
  const value = Reflect.get(env, binding) as HyperdriveBindingLike | undefined;
  return value?.connectionString;
}

function getConnectionString(preferFresh: boolean): string {
  try {
    const { env } = getCloudflareContext();
    const freshConnectionString = preferFresh
      ? readHyperdriveBinding(env, 'HYPERDRIVE_FRESH')
      : undefined;
    if (freshConnectionString) return freshConnectionString;

    const cachedConnectionString = readHyperdriveBinding(env, 'HYPERDRIVE');
    if (cachedConnectionString) return cachedConnectionString;
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

/**
 * Retorna um Prisma Client associado à requisição/renderização atual.
 * O cache do React é request-scoped no servidor do Next.js; não existe Pool
 * ou Prisma Client mutável em escopo global entre requisições do Worker.
 */
const requestFreshDatabase = cache(() => createDatabaseClient(getConnectionString(true)));
const requestCachedDatabase = cache(() => createDatabaseClient(getConnectionString(false)));

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
const databaseScope = new AsyncLocalStorage<DatabaseClient>();

export function getDb(): DatabaseClient {
  return databaseScope.getStore() ?? requestFreshDatabase();
}

/**
 * Cliente opt-in para leituras públicas que toleram o TTL do Hyperdrive.
 * Mutações, auth, permissões e read-after-write devem continuar em `getDb()`.
 */
export function getCachedDb(): DatabaseClient {
  return databaseScope.getStore() ?? requestCachedDatabase();
}

/** Reutiliza o cliente explicitamente gerenciado por Workers fora do ciclo React. */
export function withDatabaseClient<T>(client: DatabaseClient, operation: () => T): T {
  return databaseScope.run(client, operation);
}
