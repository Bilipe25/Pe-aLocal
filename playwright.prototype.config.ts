import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'combos-promotions-prototype.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3010/_next/static/prototypes/combos-promotions/',
    browserName: 'chromium',
    colorScheme: 'light',
    locale: 'pt-BR',
    screenshot: 'off',
    trace: 'off',
  },
});
