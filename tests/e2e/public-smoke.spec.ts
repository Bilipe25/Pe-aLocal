import { expect, test } from '@playwright/test';

test.describe('experiência pública', () => {
  test('carrega a home e navega para o login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/PedidoLocal/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Sua lanchonete online/ }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    await page.getByRole('link', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar no painel' })).toBeVisible();
  });

  test('formulário de login é operável e associa erros aos campos', async ({ page }) => {
    await page.goto('/login');

    const email = page.getByLabel('E-mail');
    const password = page.getByLabel('Senha');

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'email-error');
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAttribute('aria-describedby', 'password-error');
    await expect(page.locator('#email-error')).toHaveRole('alert');
    await expect(page.locator('#password-error')).toHaveRole('alert');
  });

  test('health check responde com o contrato público', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: '0.1.0',
    });
  });
});
