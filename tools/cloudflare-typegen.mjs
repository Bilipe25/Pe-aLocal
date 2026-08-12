import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wrangler = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
const prettier = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
);
const generatedTypes = fileURLToPath(new URL('../cloudflare-env.d.ts', import.meta.url));
const worker = fileURLToPath(new URL('../.open-next/worker.js', import.meta.url));
const hiddenWorker = `${worker}.typegen-${process.pid}`;
const hasBuiltWorker = existsSync(worker);

let result;

try {
  // Wrangler infers a typed self-service binding when the generated worker is
  // present. Hide that build artifact so typegen is identical on clean CI and
  // on development machines that have already run `cf:build`.
  if (hasBuiltWorker) renameSync(worker, hiddenWorker);

  result = spawnSync(
    process.execPath,
    [
      wrangler,
      'types',
      '--env-interface',
      'CloudflareEnv',
      'cloudflare-env.d.ts',
    ],
    {
      env: {
        ...process.env,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      },
      stdio: 'inherit',
    },
  );
} finally {
  if (hasBuiltWorker) renameSync(hiddenWorker, worker);
}

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  const formatResult = spawnSync(process.execPath, [prettier, '--write', generatedTypes], {
    stdio: 'inherit',
  });
  if (formatResult.error) throw formatResult.error;
  process.exitCode = formatResult.status ?? 1;
}
