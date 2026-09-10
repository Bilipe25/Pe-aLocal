import { defineConfig } from '@playwright/test';

// Runs the same layout contract against actual components, without database access.
process.env.E2E_OFFERS_COMPONENT_FIXTURE = 'true';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'storefront-offers-real.spec.ts',
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:3101', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node tests/fixtures/offers-preview/server.mjs',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: !process.env.CI,
  },
});
