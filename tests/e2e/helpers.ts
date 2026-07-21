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

export function mutationsAllowed() {
  return process.env.E2E_ALLOW_MUTATIONS === 'true';
}

export async function chooseRequiredOptionsInProductDialog(page: Page) {
  const dialog = page.getByRole('dialog');
  const requiredGroups = dialog.locator('section').filter({ hasText: 'Obrigatório' });
  for (let index = 0; index < (await requiredGroups.count()); index += 1) {
    const group = requiredGroups.nth(index);
    const firstOption = group.locator('[role="radio"], [role="checkbox"]').first();
    if (await firstOption.count()) await firstOption.click();
  }
}
