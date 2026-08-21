import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'combos-promotions-v2-prototype.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    colorScheme: 'light',
    locale: 'pt-BR',
    screenshot: 'off',
    trace: 'off',
  },
});
