import { expect, type Page } from '@playwright/test';

export interface TestCredentials {
  email: string;
  password: string;
}

export async function loginAs(page: Page, credentials: TestCredentials) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(credentials.email);
  await page.getByLabel('Senha').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export function credentialsFromEnv(prefix: 'SUPER_ADMIN' | 'OWNER'): TestCredentials | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  return email && password ? { email, password } : null;
}
