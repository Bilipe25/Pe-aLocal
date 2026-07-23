import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: '.env.local' });

const e2ePort = Number(process.env.E2E_PORT ?? 3000);
const e2eBaseUrl = `http://localhost:${e2ePort}`;
const e2eUseProductionBuild = process.env.E2E_USE_PRODUCTION_BUILD === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: `pnpm ${e2eUseProductionBuild ? 'start' : 'dev'} --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      ...process.env,
      NODE_ENV: e2eUseProductionBuild ? 'production' : 'development',
      XDG_CONFIG_HOME: path.join(process.cwd(), '.tmp-xdg'),
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
        process.env.DATABASE_URL ??
        '',
    },
  },
});
