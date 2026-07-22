import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const wrangler = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [wrangler, 'types', '--env-interface', 'CloudflareEnv', 'cloudflare-env.d.ts'],
  {
    env: {
      ...process.env,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
