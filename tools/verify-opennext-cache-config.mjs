import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const source = readFileSync(resolve(root, 'open-next.config.ts'), 'utf8');
const wrangler = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8');

const requirements = [
  ['R2 incremental cache', /incrementalCache\s*:\s*r2IncrementalCache/],
  ['Durable Object queue', /queue\s*:\s*doQueue/],
  ['sharded Durable Object tag cache', /tagCache\s*:\s*doShardedTagCache/],
];

for (const [label, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`OpenNext cache configuration is missing ${label}.`);
}
if (/dummy/i.test(source))
  throw new Error('OpenNext cache configuration contains a dummy override.');

for (const binding of ['NEXT_CACHE_DO_QUEUE', 'NEXT_TAG_CACHE_DO_SHARDED']) {
  const occurrences = wrangler.match(new RegExp(`"${binding}"`, 'g'))?.length ?? 0;
  if (occurrences < 3) {
    throw new Error(`${binding} must be bound in base, staging, and production environments.`);
  }
}
if ((wrangler.match(/"new_sqlite_classes"/g)?.length ?? 0) < 3) {
  throw new Error('Durable Object SQLite migrations must exist in every Wrangler environment.');
}

const workerArtifact = resolve(root, '.open-next', 'worker.js');
if (existsSync(workerArtifact)) {
  const worker = readFileSync(workerArtifact, 'utf8');
  for (const durableObjectClass of ['DOQueueHandler', 'DOShardedTagCache']) {
    if (!worker.includes(durableObjectClass)) {
      throw new Error(`Built worker does not export ${durableObjectClass}.`);
    }
  }
  const generatedConfigPath = resolve(
    root,
    '.open-next',
    'server-functions',
    'default',
    'open-next.config.mjs',
  );
  if (!existsSync(generatedConfigPath)) {
    throw new Error('Built OpenNext server configuration is missing.');
  }
  const generatedConfig = readFileSync(generatedConfigPath, 'utf8');
  for (const binding of ['NEXT_CACHE_DO_QUEUE', 'NEXT_TAG_CACHE_DO_SHARDED']) {
    if (!generatedConfig.includes(binding)) {
      throw new Error(`Built OpenNext configuration does not reference ${binding}.`);
    }
  }
}

console.info('[OPENNEXT_CACHE_CONFIG_OK]');
